import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ModuleCode, TrainingVideoEventType } from '@prisma/client';
import type { Request, Response } from 'express';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { TrainingAccessGuard } from './training-access.guard';
import { TrainingObjectStorageService } from './training-object-storage.service';
import { TrainingVideoService } from './training-video.service';
import {
  CreateTrainingVideoDto,
  StartTrainingVideoDto,
  TrainingVideoEventDto,
  TrainingVideoHeartbeatDto,
} from './dto/training-video.dto';

const trainingGuards = [JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, TrainingAccessGuard, PermissionGuard];

@Controller('training/video')
@UseGuards(...trainingGuards)
@RequireModule(ModuleCode.TRAINING)
export class TrainingVideoController {
  constructor(
    private readonly videos: TrainingVideoService,
    private readonly storage: TrainingObjectStorageService,
  ) {}

  @Post('start')
  @RequirePermissions('training.update')
  start(@Req() req: RequestWithUser, @Body() dto: StartTrainingVideoDto) {
    return this.videos.start(req.tenant!.id, req.user.sub, dto);
  }

  @Post('heartbeat')
  @RequirePermissions('training.update')
  heartbeat(@Req() req: RequestWithUser, @Body() dto: TrainingVideoHeartbeatDto) {
    return this.videos.heartbeat(req.tenant!.id, req.user.sub, dto, req);
  }

  @Post('pause')
  @RequirePermissions('training.update')
  pause(@Req() req: RequestWithUser, @Body() dto: TrainingVideoEventDto) {
    return this.videos.recordEvent(req.tenant!.id, req.user.sub, dto, TrainingVideoEventType.PAUSE);
  }

  @Post('ended')
  @RequirePermissions('training.update')
  ended(@Req() req: RequestWithUser, @Body() dto: TrainingVideoEventDto) {
    return this.videos.recordEvent(req.tenant!.id, req.user.sub, dto, TrainingVideoEventType.ENDED);
  }

  @Post('seek')
  @RequirePermissions('training.update')
  seek(@Req() req: RequestWithUser, @Body() dto: TrainingVideoEventDto) {
    return this.videos.recordEvent(req.tenant!.id, req.user.sub, dto, TrainingVideoEventType.SEEK);
  }

  @Get('assignments')
  @RequirePermissions('training.read')
  myAssignments(@Req() req: RequestWithUser) {
    return this.videos.listMyAssignments(req.tenant!.id, req.user.sub);
  }

  @Get('assignments/:assignmentId')
  @RequirePermissions('training.read')
  assignment(@Req() req: RequestWithUser, @Param('assignmentId') assignmentId: string) {
    return this.videos.getAssignment(req.tenant!.id, req.user.sub, assignmentId);
  }

  @Get('assignments/:assignmentId/progress')
  @RequirePermissions('training.read')
  progress(@Req() req: RequestWithUser, @Param('assignmentId') assignmentId: string) {
    return this.videos.progress(req.tenant!.id, req.user.sub, assignmentId);
  }

  @Get('assignments/:assignmentId/lessons/:lessonId/file')
  @RequirePermissions('training.read')
  async file(
    @Req() req: RequestWithUser,
    @Param('assignmentId') assignmentId: string,
    @Param('lessonId') lessonId: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    const asset = await this.videos.getVideoAsset(req.tenant!.id, req.user.sub, assignmentId, lessonId);
    const buffer = await this.readVideo(asset.storageKey);
    const requested = this.parseRange(range, buffer.length);
    response.setHeader('Content-Type', 'video/mp4');
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Length', requested.end - requested.start + 1);
    response.setHeader('Content-Range', `bytes ${requested.start}-${requested.end}/${buffer.length}`);
    response.status(requested.partial ? 206 : 200).send(buffer.subarray(requested.start, requested.end + 1));
  }

  private parseRange(range: string | undefined, size: number) {
    if (!range) return { start: 0, end: size - 1, partial: false };
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return { start: 0, end: size - 1, partial: false };
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]) - 1);
    const end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= size) {
      return { start: 0, end: size - 1, partial: false };
    }
    return { start, end, partial: true };
  }

  private async readVideo(storageKey: string) {
    try {
      return await this.storage.readKey(storageKey);
    } catch (error: any) {
      if (error?.code === 'ENOENT' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('Video file is missing from configured storage');
      }
      throw error;
    }
  }
}

@Controller('training/admin/courses')
@UseGuards(...trainingGuards)
@RequireModule(ModuleCode.TRAINING)
export class TrainingVideoAdminController {
  constructor(
    private readonly videos: TrainingVideoService,
    private readonly storage: TrainingObjectStorageService,
  ) {}

  @Post(':courseId/video')
  @RequirePermissions('training.course.update')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: Number(process.env.TRAINING_VIDEO_MAX_UPLOAD_BYTES ?? 500 * 1024 * 1024), files: 1 },
    fileFilter: (_req, file, callback) => callback(null, file.mimetype === 'video/mp4' && file.originalname.toLowerCase().endsWith('.mp4')),
  }))
  video(
    @Req() req: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: CreateTrainingVideoDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    req.auditAction = 'TRAINING_VIDEO_UPSERTED';
    return this.videos.createOrUpdateVideo(req.tenant!.id, req.user.sub, courseId, dto, file);
  }

  @Get(':courseId/lessons/:lessonId/video')
  @RequirePermissions('training.course.read')
  async adminVideo(
    @Req() req: RequestWithUser,
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    const asset = await this.videos.getAdminVideoAsset(req.tenant!.id, courseId, lessonId);
    const buffer = await this.readVideo(asset.storageKey);
    const requested = this.parseRange(range, buffer.length);
    response.setHeader('Content-Type', 'video/mp4');
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Length', requested.end - requested.start + 1);
    response.setHeader('Content-Range', `bytes ${requested.start}-${requested.end}/${buffer.length}`);
    response.status(requested.partial ? 206 : 200).send(buffer.subarray(requested.start, requested.end + 1));
  }

  private parseRange(range: string | undefined, size: number) {
    if (!range) return { start: 0, end: size - 1, partial: false };
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return { start: 0, end: size - 1, partial: false };
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]) - 1);
    const end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= size) {
      return { start: 0, end: size - 1, partial: false };
    }
    return { start, end, partial: true };
  }

  private async readVideo(storageKey: string) {
    try {
      return await this.storage.readKey(storageKey);
    } catch (error: any) {
      if (error?.code === 'ENOENT' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('Video file is missing from configured storage');
      }
      throw error;
    }
  }

  @Get(':courseId/progress')
  @RequirePermissions('training.progress.read')
  progress(@Req() req: RequestWithUser, @Param('courseId') courseId: string) {
    return this.videos.report(req.tenant!.id, courseId);
  }
}
