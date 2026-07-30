import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreatePublicApplicationDto } from './dto/create-public-application.dto';
import { CandidateAuthGuard, CandidateRequest } from './candidate-auth.guard';

@Controller('public/vacancies/:vacancyId/applications')
export class PublicApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @UseGuards(CandidateAuthGuard)
  create(
    @Req() request: CandidateRequest,
    @Param('vacancyId') vacancyId: string,
    @Body() dto: CreatePublicApplicationDto,
  ) {
    return this.applicationsService.createPublic(
      vacancyId,
      request.candidate.sub,
      request.candidate.email,
      dto,
    );
  }
}
