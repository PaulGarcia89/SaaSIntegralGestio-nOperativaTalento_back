import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AutomationModule } from '../automation/automation.module';
import { WorkflowMasterController } from './workflow-master.controller';
import { WorkflowMasterService } from './workflow-master.service';

@Module({
  imports: [PrismaModule, AutomationModule],
  controllers: [WorkflowMasterController],
  providers: [WorkflowMasterService],
})
export class WorkflowMasterModule {}
