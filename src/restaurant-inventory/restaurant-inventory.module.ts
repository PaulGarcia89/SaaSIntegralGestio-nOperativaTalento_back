import { Module } from '@nestjs/common';
import { RestaurantInventoryController } from './restaurant-inventory.controller';
import { RestaurantInventoryService } from './restaurant-inventory.service';
import { InventoryCapabilitiesModule } from '../inventory-capabilities/inventory-capabilities.module';
import { SalesImportController } from './sales-import.controller';
import { SalesImportService } from './sales-import.service';
import { RestaurantReportsController } from './restaurant-reports.controller';
import { RestaurantReportsService } from './restaurant-reports.service';
import { RestaurantInventoryContextGuard } from './restaurant-inventory-context.guard';
import { RestaurantRecipeVersionService } from './restaurant-recipe-version.service';
import { RestaurantInventoryResponseInterceptor } from './restaurant-inventory-response.interceptor';
import { RestaurantInventoryIdempotencyInterceptor } from './restaurant-inventory-idempotency.interceptor';
import { RestaurantPurchasingController } from './restaurant-purchasing.controller';
import { RestaurantPurchasingService } from './restaurant-purchasing.service';
import { RestaurantInvoiceController } from './restaurant-invoice.controller';
import { BasicInvoiceOcrProvider, INVOICE_OCR_PROVIDER, RestaurantInvoiceService } from './restaurant-invoice.service';
import { RestaurantInventoryAuditController } from './restaurant-inventory-audit.controller';
import { RestaurantInventoryAuditService } from './restaurant-inventory-audit.service';
import { RestaurantCommercialController } from './restaurant-commercial.controller';
import { RestaurantCommercialService } from './restaurant-commercial.service';
import { RestaurantCommissaryService } from './restaurant-commissary.service';

@Module({
  imports: [InventoryCapabilitiesModule],
  controllers: [RestaurantInventoryController, SalesImportController, RestaurantReportsController, RestaurantPurchasingController, RestaurantInvoiceController, RestaurantInventoryAuditController, RestaurantCommercialController],
  providers: [RestaurantInventoryService, RestaurantRecipeVersionService, SalesImportService, RestaurantReportsService, RestaurantInventoryContextGuard, RestaurantInventoryResponseInterceptor, RestaurantInventoryIdempotencyInterceptor, RestaurantPurchasingService, RestaurantInvoiceService, BasicInvoiceOcrProvider, RestaurantInventoryAuditService, RestaurantCommercialService, RestaurantCommissaryService, { provide: INVOICE_OCR_PROVIDER, useExisting: BasicInvoiceOcrProvider }],
})
export class RestaurantInventoryModule {}
