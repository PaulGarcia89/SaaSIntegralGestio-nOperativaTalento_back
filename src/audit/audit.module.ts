import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditContextInterceptor } from './audit-context.interceptor';

@Module({
  providers: [AuditService, AuditContextInterceptor],
  exports: [AuditService, AuditContextInterceptor],
})
export class AuditModule {}
