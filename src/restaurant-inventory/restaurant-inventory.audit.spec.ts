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
    expect(required(RestaurantInventoryController, 'confirmReceipt')).toEqual(['inventory.confirm']);
    expect(required(RestaurantInventoryController, 'cancelReceipt')).toEqual(['inventory.cancel']);
    expect(required(RestaurantInventoryController, 'approveStockCount')).toEqual(['inventory.confirm']);
    expect(required(RestaurantInventoryController, 'receiveTransfer')).toEqual(['inventory.confirm']);
    expect(required(RestaurantInventoryController, 'adjustment')).toEqual(['inventory.update']);
  });

  it('keeps report and import read/write boundaries explicit', () => {
    expect(required(RestaurantReportsController, 'export')).toEqual(['inventory.report.export']);
    expect(required(SalesImportController, 'summary')).toEqual(['inventory.read']);
    expect(required(SalesImportController, 'process')).toEqual(['inventory.confirm']);
    expect(required(SalesImportController, 'cancel')).toEqual(['inventory.cancel']);
  });
});
