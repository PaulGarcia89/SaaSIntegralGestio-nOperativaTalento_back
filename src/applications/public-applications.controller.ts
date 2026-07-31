import { Body, Controller, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApplicationsService } from './applications.service';
import { CreatePublicApplicationDto } from './dto/create-public-application.dto';
import { CandidateAuthGuard, CandidateRequest } from './candidate-auth.guard';

@Controller('public/vacancies/:vacancyId/applications')
export class PublicApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @UseGuards(CandidateAuthGuard)
  @UseInterceptors(FileInterceptor('resume', {
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  }))
  create(
    @Req() request: CandidateRequest,
    @Param('vacancyId') vacancyId: string,
    @Body() dto: CreatePublicApplicationDto,
    @UploadedFile() resume: Express.Multer.File | undefined,
  ) {
    return this.applicationsService.createPublic(
      vacancyId,
      request.candidate.sub,
      request.candidate.email,
      dto,
      resume,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
    );
  }
}
