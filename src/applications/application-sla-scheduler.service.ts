import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ApplicationSlaService } from './application-sla.service';

@Injectable()
export class ApplicationSlaSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApplicationSlaSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly sla: ApplicationSlaService) {}

  onModuleInit() {
    if (process.env.ATS_SLA_WORKER_ENABLED === 'false') return;
    const intervalMs = Math.max(60_000, Number(process.env.ATS_SLA_POLL_MS ?? 300_000));
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
      const result = await this.sla.processDue();
      if (result.warned || result.escalated || result.reassigned) this.logger.log(`SLA ATS: ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error('No se pudo procesar la automatización SLA del ATS', error instanceof Error ? error.stack : String(error));
    } finally {
      this.running = false;
    }
  }
}
