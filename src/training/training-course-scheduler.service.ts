import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { TrainingCourseStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class TrainingCourseSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrainingCourseSchedulerService.name);
  private readonly intervalMs = 60_000;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.processDueCourses();
    this.timer = setInterval(() => void this.processDueCourses(), this.intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async processDueCourses(now = new Date(), tenantId?: string) {
    if (this.running) return { skipped: true, published: 0, retired: 0 };
    this.running = true;
    try {
      const [coursesToPublish, coursesToRetire] = await Promise.all([
        this.prisma.trainingCourse.findMany({
          where: {
            tenantId,
            status: TrainingCourseStatus.SCHEDULED,
            scheduledPublishAt: { lte: now },
          },
          select: { id: true },
        }),
        this.prisma.trainingCourse.findMany({
          where: {
            tenantId,
            status: {
              in: [TrainingCourseStatus.PUBLISHED, TrainingCourseStatus.PAUSED],
            },
            scheduledRetireAt: { lte: now },
          },
          select: { id: true, status: true },
        }),
      ]);
      let publishedCount = 0;
      let retiredCount = 0;
      for (const course of coursesToPublish) {
        const changed = await this.prisma.$transaction(async (tx) => {
          const result = await tx.trainingCourse.updateMany({
            where: { id: course.id, status: TrainingCourseStatus.SCHEDULED },
            data: {
              status: TrainingCourseStatus.PUBLISHED,
              isPublished: true,
              publishedAt: now,
              scheduledPublishAt: null,
            },
          });
          if (result.count) {
            await tx.trainingCourseTransition.create({
              data: {
                courseId: course.id,
                fromStatus: TrainingCourseStatus.SCHEDULED,
                toStatus: TrainingCourseStatus.PUBLISHED,
                action: 'SCHEDULED_PUBLICATION',
              },
            });
          }
          return result.count;
        });
        publishedCount += changed;
      }
      for (const course of coursesToRetire) {
        const changed = await this.prisma.$transaction(async (tx) => {
          const result = await tx.trainingCourse.updateMany({
            where: { id: course.id, status: course.status },
            data: {
              status: TrainingCourseStatus.RETIRED,
              isPublished: false,
              retiredAt: now,
            },
          });
          if (result.count) {
            await tx.trainingCourseTransition.create({
              data: {
                courseId: course.id,
                fromStatus: course.status,
                toStatus: TrainingCourseStatus.RETIRED,
                action: 'SCHEDULED_RETIREMENT',
              },
            });
          }
          return result.count;
        });
        retiredCount += changed;
      }
      if (publishedCount || retiredCount) {
        this.logger.log(
          `Processed scheduled courses: ${publishedCount} published, ${retiredCount} retired`,
        );
      }
      return { skipped: false, published: publishedCount, retired: retiredCount };
    } catch (error) {
      this.logger.error('Unable to process scheduled courses', error);
      if (tenantId) throw error;
      return { skipped: false, published: 0, retired: 0, failed: true };
    } finally {
      this.running = false;
    }
  }
}
