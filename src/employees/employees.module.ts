import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { SubscriptionGuard } from '../common/guards/subscription.guard';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, SubscriptionGuard],
})
export class EmployeesModule {}
