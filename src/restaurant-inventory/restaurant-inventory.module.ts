import { Module } from '@nestjs/common';
import { RestaurantInventoryController } from './restaurant-inventory.controller';
import { RestaurantInventoryService } from './restaurant-inventory.service';
import { InventoryCapabilitiesModule } from '../inventory-capabilities/inventory-capabilities.module';
import { SalesImportController } from './sales-import.controller';
import { SalesImportService } from './sales-import.service';
import { RestaurantReportsController } from './restaurant-reports.controller';
import { RestaurantReportsService } from './restaurant-reports.service';

@Module({
  imports: [InventoryCapabilitiesModule],
  controllers: [RestaurantInventoryController, SalesImportController, RestaurantReportsController],
  providers: [RestaurantInventoryService, SalesImportService, RestaurantReportsService],
})
export class RestaurantInventoryModule {}
