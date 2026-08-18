import { Body, Controller, Delete, Get, Param, Post, Put, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApplicationsService } from './applications.service';
import { CreatePublicApplicationDto } from './dto/create-public-application.dto';
import { CandidateAuthGuard, CandidateRequest } from './candidate-auth.guard';
import { Response } from 'express';
import { PublicApplicationDraftDto } from './dto/public-application-draft.dto';

@Controller('public/vacancies/:vacancyId/applications')
export class PublicApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get('draft')
  getDraft(@Param('vacancyId') vacancyId: string, @Req() request: CandidateRequest, @Res({ passthrough: true }) response: Response) {
    return this.applicationsService.getPublicDraft(vacancyId, request.headers['x-draft-token'] as string | undefined, request.headers.cookie ?? '', response, request.ip);
  }

  @Put('draft')
  saveDraft(
    @Param('vacancyId') vacancyId: string,
    @Req() request: CandidateRequest,
    @Body() body: PublicApplicationDraftDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.applicationsService.savePublicDraft(vacancyId, request.headers['x-draft-token'] as string | undefined, request.headers.cookie ?? '', body.value, response, request.ip);
  }

  @Delete('draft')
  deleteDraft(@Param('vacancyId') vacancyId: string, @Req() request: CandidateRequest, @Res({ passthrough: true }) response: Response) {
    return this.applicationsService.deletePublicDraft(vacancyId, request.headers['x-draft-token'] as string | undefined, request.headers.cookie ?? '', response, request.ip);
  }

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
