import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { RequestWithUser } from '../types/request-with-user.type';

@Injectable()
export class ActivityTrackingInterceptor implements NestInterceptor {
  private readonly lastWriteByUser = new Map<string, number>();
  private readonly flushIntervalMs = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest<RequestWithUser>();
      const userId = request.user?.sub;

      if (userId) {
        const now = Date.now();
        const lastWrite = this.lastWriteByUser.get(userId) ?? 0;

        if (now - lastWrite >= this.flushIntervalMs) {
          this.lastWriteByUser.set(userId, now);
          void this.prisma.user
            .update({
              where: { id: userId },
              data: { lastSeenAt: new Date(now) },
            })
            .catch(() => {
              this.lastWriteByUser.delete(userId);
            });
        }
      }
    }

    return next.handle();
  }
}
