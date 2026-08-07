import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { EnterpriseIntegrationsModule } from '../enterprise-integrations/enterprise-integrations.module';

@Module({
  imports: [PrismaModule, WorkflowsModule, EnterpriseIntegrationsModule],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
