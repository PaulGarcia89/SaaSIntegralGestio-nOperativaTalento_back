import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListPublicVacanciesDto } from './dto/list-public-vacancies.dto';
import { VacanciesService } from './vacancies.service';

@Controller('public/vacancies')
export class PublicVacanciesController {
  constructor(private readonly vacanciesService: VacanciesService) {}

  @Get()
  findAll(@Query() query: ListPublicVacanciesDto) {
    return this.vacanciesService.findPublic(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vacanciesService.findPublicOne(id);
  }
}
