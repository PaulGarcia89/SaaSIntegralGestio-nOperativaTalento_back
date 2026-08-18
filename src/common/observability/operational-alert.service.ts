import { Injectable, Logger } from '@nestjs/common';

type AlertInput = {
  fingerprint: string;
  requestId: string | null;
  route: string;
  method: string;
  statusCode: number;
  tenantId: string | null;
  message: string;
};

type AlertBucket = { count: number; resetAt: number };

@Injectable()
export class OperationalAlertService {
  private readonly logger = new Logger(OperationalAlertService.name);
  private readonly buckets = new Map<string, AlertBucket>();

  report(input: AlertInput) {
    if (input.statusCode < 500) return;
    const now = Date.now();
    const current = this.buckets.get(input.fingerprint);
    const bucket = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + 60_000 }
      : { ...current, count: current.count + 1 };
    this.buckets.set(input.fingerprint, bucket);
    const threshold = Number(process.env.OPERATIONS_ALERT_THRESHOLD ?? 3);
    if (bucket.count !== threshold) return;

    // Railway can alert on this stable JSON signature without shipping request data elsewhere.
    this.logger.error(JSON.stringify({ type: 'operational_alert', severity: 'critical', ...input, count: bucket.count, windowSeconds: 60 }));
  }
}
