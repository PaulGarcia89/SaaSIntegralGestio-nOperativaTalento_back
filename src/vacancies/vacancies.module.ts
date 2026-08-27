import { Module } from '@nestjs/common';
import { CareerPortalsModule } from '../career-portals/career-portals.module';
import { PublicVacanciesController } from './public-vacancies.controller';
import { VacanciesController } from './vacancies.controller';
import { VacanciesService } from './vacancies.service';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { TrainingAntivirusService } from '../training/training-antivirus.service';
import { PersonnelRequisitionsService } from './personnel-requisitions.service';

@Module({
  imports: [CareerPortalsModule],
  controllers: [VacanciesController, PublicVacanciesController],
  providers: [
    VacanciesService,
    PersonnelRequisitionsService,
    SubscriptionGuard,
    ModuleAccessGuard,
    TrainingAntivirusService,
  ],
})
export class VacanciesModule {}
