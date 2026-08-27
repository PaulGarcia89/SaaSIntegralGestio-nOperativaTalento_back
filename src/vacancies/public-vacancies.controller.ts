import { Controller, Get, Param, Query } from '@nestjs/common';
import { CareerPortalsService } from '../career-portals/career-portals.service';
import { ListPublicVacanciesDto } from './dto/list-public-vacancies.dto';

@Controller('public/vacancies')
export class PublicVacanciesController {
  constructor(private readonly careerPortalsService: CareerPortalsService) {}

  @Get()
  findAll(@Query() query: ListPublicVacanciesDto) {
    return this.careerPortalsService.listPublicVacancies(undefined, query);
  }

  @Get(':id')
  findOne(@Param('id') publicSlug: string) {
    return this.careerPortalsService.getPublicVacancy(publicSlug);
  }
}
