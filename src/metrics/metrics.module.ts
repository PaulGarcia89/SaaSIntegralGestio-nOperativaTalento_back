import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { ScopeGuard } from '../common/guards/scope.guard';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  imports: [PrismaModule],
  controllers: [MetricsController],
  providers: [MetricsService, ScopeGuard, PermissionGuard],
})
export class MetricsModule {}
