import { Module } from '@nestjs/common';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TrainingModule } from '../training/training.module';
import { InventoryController } from './inventory.controller';
import { InventoryEvidenceStorageService } from './inventory-evidence-storage.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [TrainingModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryEvidenceStorageService, SubscriptionGuard, ModuleAccessGuard],
  exports: [InventoryService],
})
export class InventoryModule {}
