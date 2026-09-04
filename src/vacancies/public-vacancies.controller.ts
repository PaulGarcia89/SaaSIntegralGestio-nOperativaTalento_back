import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { CareerPortalsService } from '../career-portals/career-portals.service';
import { ListPublicVacanciesDto } from './dto/list-public-vacancies.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('public/vacancies')
@Public()
export class PublicVacanciesController {
  constructor(private readonly careerPortalsService: CareerPortalsService) {}

  @Get()
  findAll(@Query() query: ListPublicVacanciesDto, @Headers('x-locale') locale?: string) {
    return this.careerPortalsService.listPublicVacancies(undefined, query, locale);
  }

  @Get(':id')
  findOne(@Param('id') publicSlug: string, @Headers('x-locale') locale?: string) {
    return this.careerPortalsService.getPublicVacancy(publicSlug, undefined, locale);
  }
}
