import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { SubscriptionGuard } from '../common/guards/subscription.guard';

@Module({
  controllers: [BranchesController],
  providers: [BranchesService, SubscriptionGuard],
  exports: [BranchesService],
})
export class BranchesModule {}
