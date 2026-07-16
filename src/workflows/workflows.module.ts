import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowStepsController } from './workflow-steps.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  controllers: [WorkflowsController, WorkflowStepsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
