import { Module } from '@nestjs/common';
import { InventoryCapabilitiesController, InventoryModulesMeController } from './inventory-capabilities.controller';
import { InventoryCapabilityGuard } from './inventory-capability.guard';
import { InventoryCapabilitiesService } from './inventory-capabilities.service';
import { ScopeGuard } from '../common/guards/scope.guard';

@Module({
  controllers: [InventoryCapabilitiesController, InventoryModulesMeController],
  providers: [InventoryCapabilitiesService, InventoryCapabilityGuard, ScopeGuard],
  exports: [InventoryCapabilitiesService, InventoryCapabilityGuard],
})
export class InventoryCapabilitiesModule {}
