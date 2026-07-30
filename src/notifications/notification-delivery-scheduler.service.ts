import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationDeliverySchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationDeliverySchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly notifications: NotificationsService) {}

  onModuleInit() {
    if (process.env.NOTIFICATION_DELIVERY_WORKER_ENABLED === 'false') return;
    const intervalMs = Math.max(
      10_000,
      Number(process.env.NOTIFICATION_DELIVERY_POLL_MS ?? 30_000),
    );
    this.timer = setInterval(() => void this.process(), intervalMs);
    this.timer.unref();
    void this.process();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async process() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.notifications.processDueDeliveries();
      if (result.processed > 0) {
        this.logger.log(
          `Entregas procesadas: ${result.processed}; fallos internos: ${result.failed}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'No se pudo procesar la cola persistente de notificaciones',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
