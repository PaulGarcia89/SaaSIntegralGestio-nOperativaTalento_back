import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreatePublicApplicationDto } from './dto/create-public-application.dto';

@Controller('public/vacancies/:vacancyId/applications')
export class PublicApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  create(
    @Param('vacancyId') vacancyId: string,
    @Body() dto: CreatePublicApplicationDto,
  ) {
    return this.applicationsService.createPublic(vacancyId, dto);
  }
}
