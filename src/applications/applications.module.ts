import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { PublicApplicationsController } from './public-applications.controller';

@Module({
  controllers: [ApplicationsController, PublicApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
