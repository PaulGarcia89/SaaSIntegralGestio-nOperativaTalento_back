import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { EmployeeSensitiveDataCryptoService } from './employee-sensitive-data-crypto.service';
import { SubscriptionGuard } from '../common/guards/subscription.guard';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeeSensitiveDataCryptoService, SubscriptionGuard],
})
export class EmployeesModule {}
