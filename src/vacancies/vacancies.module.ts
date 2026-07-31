import { Module } from '@nestjs/common';
import { PublicVacanciesController } from './public-vacancies.controller';
import { VacanciesController } from './vacancies.controller';
import { VacanciesService } from './vacancies.service';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { AtsPrivateFileService } from '../common/files/ats-private-file.service';
import { TrainingAntivirusService } from '../training/training-antivirus.service';

@Module({
  controllers: [VacanciesController, PublicVacanciesController],
  providers: [
    VacanciesService,
    SubscriptionGuard,
    ModuleAccessGuard,
    AtsPrivateFileService,
    TrainingAntivirusService,
  ],
})
export class VacanciesModule {}
