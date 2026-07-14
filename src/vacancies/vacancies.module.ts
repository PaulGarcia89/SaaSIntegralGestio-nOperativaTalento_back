import { Module } from '@nestjs/common';
import { PublicVacanciesController } from './public-vacancies.controller';
import { VacanciesController } from './vacancies.controller';
import { VacanciesService } from './vacancies.service';

@Module({
  controllers: [VacanciesController, PublicVacanciesController],
  providers: [VacanciesService],
})
export class VacanciesModule {}
