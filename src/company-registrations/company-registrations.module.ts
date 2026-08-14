import { Module } from '@nestjs/common';
import { CompanyRegistrationsService } from './company-registrations.service';
import { AdminCompanyRegistrationsController, PublicCompanyRegistrationsController } from './company-registrations.controller';

@Module({
  controllers: [PublicCompanyRegistrationsController, AdminCompanyRegistrationsController],
  providers: [CompanyRegistrationsService],
})
export class CompanyRegistrationsModule {}
