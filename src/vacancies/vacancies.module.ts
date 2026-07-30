import { Module } from '@nestjs/common';
import { PublicVacanciesController } from './public-vacancies.controller';
import { VacanciesController } from './vacancies.controller';
import { VacanciesService } from './vacancies.service';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';

@Module({
  controllers: [VacanciesController, PublicVacanciesController],
  providers: [VacanciesService, SubscriptionGuard, ModuleAccessGuard],
})
export class VacanciesModule {}
