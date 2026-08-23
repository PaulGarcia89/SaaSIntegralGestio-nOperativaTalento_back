import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TrainingContentBlockType,
  TrainingCourseStepType,
  TrainingProgressStatus,
  TrainingVideoEventType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';
import { TrainingObjectStorageService } from './training-object-storage.service';
import {
  CreateTrainingVideoDto,
  StartTrainingVideoDto,
  TrainingVideoEventDto,
  TrainingVideoHeartbeatDto,
} from './dto/training-video.dto';

const MAX_HEARTBEAT_SECONDS = 30;
const SEEK_GRACE_SECONDS = 5;

@Injectable()
export class TrainingVideoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: TrainingObjectStorageService,
  ) {}

  async createOrUpdateVideo(
    tenantId: string,
    actorId: string,
    courseId: string,
    dto: CreateTrainingVideoDto,
    file?: Express.Multer.File,
  ) {
    if (!file && !dto.videoUrl) {
      throw new BadRequestException('A video file or an authorized video URL is required');
    }
    if (file && (file.mimetype !== 'video/mp4' || !file.originalname.toLowerCase().endsWith('.mp4'))) {
      throw new BadRequestException('Only MP4 video files are supported');
    }
    const maxBytes = Number(process.env.TRAINING_VIDEO_MAX_UPLOAD_BYTES ?? 500 * 1024 * 1024);
    if (file && file.size > maxBytes) {
      throw new BadRequestException('Video exceeds the configured upload limit');
    }
    if (dto.videoUrl && !this.isAuthorizedVideoUrl(dto.videoUrl)) {
      throw new BadRequestException('Video URL is not authorized');
    }

    const course = await this.prisma.trainingCourse.findFirst({
      where: { id: courseId, tenantId },
      select: { id: true, title: true },
    });
    if (!course) throw new NotFoundException('Training course not found');

    const lesson = dto.lessonId
      ? await this.prisma.trainingLesson.findFirst({
          where: { id: dto.lessonId, module: { courseId } },
          select: { id: true, moduleId: true },
        })
      : null;
    if (dto.lessonId && !lesson) throw new NotFoundException('Training lesson not found');

    const module = lesson
      ? null
      : dto.moduleId
        ? await this.prisma.trainingCourseModule.findFirst({ where: { id: dto.moduleId, courseId } })
        : await this.prisma.trainingCourseModule.findFirst({
            where: { courseId },
            orderBy: { sortOrder: 'asc' },
          });
    if (!lesson && dto.moduleId && !module) throw new NotFoundException('Training course module not found');

    const storageKey = file ? `videos/${tenantId}/${randomUUID()}.mp4` : undefined;
    if (file && storageKey) await this.storage.put(storageKey, file.buffer, 'video/mp4');

    return this.prisma.$transaction(async (tx) => {
      const targetModule = module ?? (await tx.trainingCourseModule.create({
        data: { courseId, title: dto.title, isRequired: dto.isMandatory ?? true },
      }));
      const target = lesson ?? (await tx.trainingLesson.create({
        data: {
          moduleId: targetModule.id,
          type: TrainingCourseStepType.VIDEO,
          title: dto.title,
          description: dto.description,
          isRequired: dto.isMandatory ?? true,
        },
      }));
      const updated = await tx.trainingLesson.update({
        where: { id: target.id },
        data: {
          type: TrainingCourseStepType.VIDEO,
          title: dto.title,
          description: dto.description,
          videoStorageKey: storageKey,
          videoUrl: dto.videoUrl,
          thumbnailUrl: dto.thumbnailUrl,
          durationSeconds: dto.durationSeconds,
          estimatedMinutes: Math.max(1, Math.ceil(dto.durationSeconds / 60)),
          requiredCompletionPercentage: dto.requiredCompletionPercentage ?? 90,
          allowReplay: dto.allowReplay ?? false,
          isRequired: dto.isMandatory ?? true,
          isActive: dto.isActive ?? true,
          publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined,
        },
      });
      const videoBlock = await tx.trainingContentBlock.findFirst({
        where: { lessonId: target.id, type: TrainingContentBlockType.VIDEO },
        select: { id: true },
      });
      if (videoBlock) {
        await tx.trainingContentBlock.update({
          where: { id: videoBlock.id },
          data: { title: dto.title, resourceUrl: dto.videoUrl ?? null, isRequired: dto.isMandatory ?? true },
        });
      } else {
        await tx.trainingContentBlock.create({
          data: {
            lessonId: target.id,
            type: TrainingContentBlockType.VIDEO,
            title: dto.title,
            resourceUrl: dto.videoUrl ?? null,
            isRequired: dto.isMandatory ?? true,
          },
        });
      }
      await tx.trainingCourse.update({
        where: { id: courseId },
        data: {
          type: 'VIDEO',
          resourceType: 'VIDEO',
          categoryId: dto.categoryId,
          isRequired: dto.isMandatory ?? true,
          updatedById: actorId,
        },
      });
      return updated;
    });
  }

  async start(tenantId: string, userId: string, dto: StartTrainingVideoDto) {
    const context = await this.getContext(tenantId, userId, dto.assignmentId, dto.lessonId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.trainingVideoProgress.findUnique({
        where: { assignmentId_lessonId: { assignmentId: dto.assignmentId, lessonId: dto.lessonId } },
      });
      const progress = await tx.trainingVideoProgress.upsert({
        where: { assignmentId_lessonId: { assignmentId: dto.assignmentId, lessonId: dto.lessonId } },
        update: { playbackSessionId: dto.playbackSessionId, startedAt: existing?.startedAt ?? now },
        create: {
          tenantId,
          assignmentId: dto.assignmentId,
          lessonId: dto.lessonId,
          userId,
          playbackSessionId: dto.playbackSessionId,
          startedAt: now,
        },
      });
      await tx.trainingAssignment.updateMany({
        where: { id: dto.assignmentId, tenantId, userId, status: TrainingProgressStatus.NOT_STARTED },
        data: { status: TrainingProgressStatus.IN_PROGRESS },
      });
      await tx.trainingVideoProgressEvent.create({
        data: this.eventData(tenantId, userId, dto, TrainingVideoEventType.PLAY, context.durationSeconds, progress.id),
      });
      return this.progressResponse(progress, context.durationSeconds);
    });
  }

  async heartbeat(
    tenantId: string,
    userId: string,
    dto: TrainingVideoHeartbeatDto,
    request: Request,
  ) {
    const context = await this.getContext(tenantId, userId, dto.assignmentId, dto.lessonId);
    const duration = context.durationSeconds;
    if (dto.durationSeconds !== duration) throw new BadRequestException('Video duration does not match the server');
    if (dto.currentTimeSeconds > duration) throw new BadRequestException('Video position exceeds its duration');
    const now = new Date();
    const rate = dto.playbackRate ?? 1;
    const ipAddress = request.ip?.slice(0, 64);
    const userAgent = request.headers['user-agent']?.slice(0, 512);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.trainingVideoProgress.findUnique({
        where: { assignmentId_lessonId: { assignmentId: dto.assignmentId, lessonId: dto.lessonId } },
      });
      const previousPosition = existing?.lastPositionSeconds ?? 0;
      const elapsed = existing?.lastHeartbeatAt
        ? Math.max(0, Math.min(MAX_HEARTBEAT_SECONDS, (now.getTime() - existing.lastHeartbeatAt.getTime()) / 1000))
        : 0;
      const forwardMovement = dto.currentTimeSeconds - previousPosition;
      const reasonableMovement = forwardMovement >= 0 && forwardMovement <= elapsed * rate + SEEK_GRACE_SECONDS;
      const credited = dto.isPlaying && reasonableMovement ? Math.floor(Math.min(elapsed * rate, MAX_HEARTBEAT_SECONDS)) : 0;
      const watchedSeconds = Math.min(duration, (existing?.watchedSeconds ?? 0) + credited);
      const completionPercentage = Math.min(100, Math.floor((watchedSeconds / duration) * 100));
      const completed = completionPercentage >= context.requiredCompletionPercentage;
      const progress = await tx.trainingVideoProgress.upsert({
        where: { assignmentId_lessonId: { assignmentId: dto.assignmentId, lessonId: dto.lessonId } },
        update: {
          lastPositionSeconds: dto.currentTimeSeconds,
          highestPositionSeconds: Math.max(existing?.highestPositionSeconds ?? 0, dto.currentTimeSeconds),
          watchedSeconds,
          completionPercentage,
          playbackSessionId: dto.playbackSessionId,
          startedAt: existing?.startedAt ?? now,
          lastHeartbeatAt: now,
          completedAt: completed ? existing?.completedAt ?? now : existing?.completedAt,
        },
        create: {
          tenantId,
          assignmentId: dto.assignmentId,
          lessonId: dto.lessonId,
          userId,
          lastPositionSeconds: dto.currentTimeSeconds,
          highestPositionSeconds: dto.currentTimeSeconds,
          watchedSeconds,
          completionPercentage,
          playbackSessionId: dto.playbackSessionId,
          startedAt: now,
          lastHeartbeatAt: now,
          completedAt: completed ? now : null,
        },
      });
      await tx.trainingVideoProgressEvent.create({
        data: {
          ...this.eventData(tenantId, userId, dto, TrainingVideoEventType.HEARTBEAT, duration, progress.id),
          ipAddress,
          userAgent,
        },
      });
      if (completed && !existing?.completedAt) {
        await tx.trainingVideoProgressEvent.create({
          data: this.eventData(tenantId, userId, dto, TrainingVideoEventType.COMPLETED, duration, progress.id),
        });
      }
      const assignment = await this.updateAssignmentCompletion(tx, context.assignmentId, tenantId, userId);
      return { ...this.progressResponse(progress, duration), assignment };
    });
  }

  async recordEvent(
    tenantId: string,
    userId: string,
    dto: TrainingVideoEventDto,
    eventType: TrainingVideoEventType,
  ) {
    const context = await this.getContext(tenantId, userId, dto.assignmentId, dto.lessonId);
    if (dto.durationSeconds !== context.durationSeconds || dto.currentTimeSeconds > context.durationSeconds) {
      throw new BadRequestException('Video position or duration is invalid');
    }
    const progress = await this.prisma.trainingVideoProgress.findUnique({
      where: { assignmentId_lessonId: { assignmentId: dto.assignmentId, lessonId: dto.lessonId } },
    });
    return this.prisma.trainingVideoProgressEvent.create({
      data: this.eventData(tenantId, userId, dto, eventType, context.durationSeconds, progress?.id),
    });
  }

  listMyAssignments(tenantId: string, userId: string) {
    return this.prisma.trainingAssignment.findMany({
      where: { tenantId, userId },
      include: {
        course: { include: { modules: { include: { lessons: { where: { type: TrainingCourseStepType.VIDEO } } } } } },
        videoProgress: true,
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getAssignment(tenantId: string, userId: string, assignmentId: string) {
    const assignment = await this.prisma.trainingAssignment.findFirst({
      where: { id: assignmentId, tenantId, userId },
      include: { course: { include: { modules: { include: { lessons: true } } } }, videoProgress: true },
    });
    if (!assignment) throw new NotFoundException('Training assignment not found');
    return assignment;
  }

  async progress(tenantId: string, userId: string, assignmentId: string) {
    await this.assertAssignment(tenantId, userId, assignmentId);
    return this.prisma.trainingVideoProgress.findMany({
      where: { tenantId, userId, assignmentId },
      include: { lesson: { select: { id: true, title: true, durationSeconds: true, requiredCompletionPercentage: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getVideoAsset(tenantId: string, userId: string, assignmentId: string, lessonId: string) {
    await this.getContext(tenantId, userId, assignmentId, lessonId);
    const lesson = await this.prisma.trainingLesson.findFirst({
      where: { id: lessonId, module: { course: { tenantId } } },
      select: { videoStorageKey: true },
    });
    if (!lesson?.videoStorageKey) throw new NotFoundException('Video file is not available');
    return { storageKey: lesson.videoStorageKey };
  }

  report(tenantId: string, courseId: string) {
    return this.prisma.trainingAssignment.findMany({
      where: { tenantId, courseId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        videoProgress: { select: { watchedSeconds: true, completionPercentage: true, startedAt: true, completedAt: true, lastHeartbeatAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async getContext(tenantId: string, userId: string, assignmentId: string, lessonId: string) {
    const assignment = await this.prisma.trainingAssignment.findFirst({
      where: { id: assignmentId, tenantId, userId },
      select: { id: true, courseId: true, dueAt: true, status: true },
    });
    if (!assignment?.courseId) throw new ForbiddenException('Video assignment is not owned by the current user');
    const lesson = await this.prisma.trainingLesson.findFirst({
      where: { id: lessonId, type: TrainingCourseStepType.VIDEO, isActive: true, module: { courseId: assignment.courseId } },
      select: { id: true, durationSeconds: true, requiredCompletionPercentage: true, allowReplay: true },
    });
    if (!lesson?.durationSeconds) throw new NotFoundException('Video lesson not found');
    if (assignment.status === TrainingProgressStatus.COMPLETED && !lesson.allowReplay) {
      throw new ConflictException('Completed video assignments cannot be replayed');
    }
    return {
      assignmentId: assignment.id,
      durationSeconds: lesson.durationSeconds,
      requiredCompletionPercentage: lesson.requiredCompletionPercentage,
      dueAt: assignment.dueAt,
    };
  }

  private async assertAssignment(tenantId: string, userId: string, assignmentId: string) {
    const item = await this.prisma.trainingAssignment.findFirst({ where: { id: assignmentId, tenantId, userId }, select: { id: true } });
    if (!item) throw new NotFoundException('Training assignment not found');
  }

  private async updateAssignmentCompletion(tx: Prisma.TransactionClient, assignmentId: string, tenantId: string, userId: string) {
    const assignment = await tx.trainingAssignment.findFirst({
      where: { id: assignmentId, tenantId, userId },
      include: { course: { include: { modules: { include: { lessons: { where: { isRequired: true } } } } } } },
    });
    if (!assignment) throw new NotFoundException('Training assignment not found');
    const requiredLessons = assignment.course?.modules.flatMap((module) => module.lessons) ?? [];
    const videoIds = requiredLessons.filter((lesson) => lesson.type === TrainingCourseStepType.VIDEO).map((lesson) => lesson.id);
    const nonVideoIds = requiredLessons.filter((lesson) => lesson.type !== TrainingCourseStepType.VIDEO).map((lesson) => lesson.id);
    const completedVideoIds = await tx.trainingVideoProgress.findMany({ where: { assignmentId, lessonId: { in: videoIds }, completedAt: { not: null } }, select: { lessonId: true } });
    const completedNonVideoIds = await tx.trainingLessonProgress.findMany({ where: { tenantId, userId, lessonId: { in: nonVideoIds }, isCompleted: true }, select: { lessonId: true } });
    const completedCount = new Set([...completedVideoIds.map((item) => item.lessonId), ...completedNonVideoIds.map((item) => item.lessonId)]).size;
    const completed = requiredLessons.length > 0 && completedCount === requiredLessons.length;
    const percent = requiredLessons.length === 0 ? assignment.progressPercent : Math.floor((completedCount / requiredLessons.length) * 100);
    const overdue = Boolean(assignment.dueAt && assignment.dueAt < new Date());
    const status = completed ? TrainingProgressStatus.COMPLETED : overdue ? TrainingProgressStatus.OVERDUE : TrainingProgressStatus.IN_PROGRESS;
    return tx.trainingAssignment.update({ where: { id: assignmentId }, data: { progressPercent: percent, status, completedAt: completed ? assignment.completedAt ?? new Date() : assignment.completedAt } });
  }

  private eventData(tenantId: string, userId: string, dto: TrainingVideoEventDto | StartTrainingVideoDto, eventType: TrainingVideoEventType, durationSeconds: number, progressId?: string | null) {
    return {
      tenantId,
      assignmentId: dto.assignmentId,
      lessonId: dto.lessonId,
      userId,
      playbackSessionId: dto.playbackSessionId,
      eventType,
      currentTimeSeconds: 'currentTimeSeconds' in dto ? dto.currentTimeSeconds : 0,
      durationSeconds,
      progressId: progressId ?? undefined,
    };
  }

  private progressResponse(progress: { watchedSeconds: number; completionPercentage: number; completedAt: Date | null }, durationSeconds: number) {
    return { ...progress, durationSeconds, serverCompletionPercentage: progress.completionPercentage };
  }

  private isAuthorizedVideoUrl(value: string) {
    const url = new URL(value);
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') return false;
    const hosts = (process.env.TRAINING_VIDEO_ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean);
    return hosts.length > 0 ? hosts.includes(url.hostname) : process.env.NODE_ENV !== 'production';
  }
}
