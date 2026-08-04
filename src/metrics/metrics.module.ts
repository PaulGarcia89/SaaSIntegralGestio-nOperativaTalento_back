import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { ScopeGuard } from '../common/guards/scope.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { ProductionIntegrationCertificationService } from './production-integration-certification.service';

@Module({
  imports: [PrismaModule, RecruitmentModule],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    ProductionIntegrationCertificationService,
    ScopeGuard,
    PermissionGuard,
  ],
  exports: [ProductionIntegrationCertificationService],
})
export class MetricsModule {}
