import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { RestaurantInventoryController } from './restaurant-inventory.controller';
import { RestaurantReportsController } from './restaurant-reports.controller';
import { SalesImportController } from './sales-import.controller';
import { REQUIRED_PERMISSIONS_KEY } from '../common/constants/auth.constants';

describe('Restaurant inventory production contract', () => {
  const reflector = new Reflector();
  const required = (controller: any, method: string) => reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [controller.prototype[method], controller]);

  it('protects destructive inventory transitions with mutation permissions', () => {
    expect(required(RestaurantInventoryController, 'confirmReceipt')).toEqual(['restaurant_inventory.receipts.confirm']);
    expect(required(RestaurantInventoryController, 'cancelReceipt')).toEqual(['inventory.cancel']);
    expect(required(RestaurantInventoryController, 'approveStockCount')).toEqual(['restaurant_inventory.counts.approve']);
    expect(required(RestaurantInventoryController, 'receiveTransfer')).toEqual(['restaurant_inventory.transfers.manage']);
    expect(required(RestaurantInventoryController, 'adjustment')).toEqual(['restaurant_inventory.adjustments.create']);
  });

  it('keeps report and import read/write boundaries explicit', () => {
    expect(required(RestaurantReportsController, 'export')).toEqual(['inventory.report.export']);
    expect(required(SalesImportController, 'summary')).toEqual(['inventory.read']);
    expect(required(SalesImportController, 'process')).toEqual(['restaurant_inventory.operations.confirm']);
    expect(required(SalesImportController, 'cancel')).toEqual(['inventory.cancel']);
  });
});
