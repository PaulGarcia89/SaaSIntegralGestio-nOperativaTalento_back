import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { SkipRateLimit } from '../common/rate-limit/rate-limit.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
@Public()
@SkipRateLimit()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  getLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Get()
  getHealth() {
    return this.healthService.getHealth();
  }
}
