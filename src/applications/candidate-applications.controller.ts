import { Body, Controller, Get, Param, Post, Put, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApplicationsService } from './applications.service';
import { CandidateAuthGuard, CandidateRequest } from './candidate-auth.guard';
import { CandidatePortalService } from './candidate-portal.service';
import { CreateCandidatePrivacyRequestDto, CreateCandidateSupportRequestDto, ReplyCandidateConversationDto, WithdrawCandidateApplicationDto } from './dto/candidate-self-service.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('candidate/applications')
@Public()
@UseGuards(CandidateAuthGuard)
export class CandidateApplicationsController {
  constructor(
    private readonly applications: ApplicationsService,
    private readonly portal: CandidatePortalService,
  ) {}

  @Get()
  findMine(@Req() request: CandidateRequest) {
    return this.applications.listForCandidate(request.candidate.sub);
  }

  @Get('portal')
  portalOverview(@Req() request: CandidateRequest) {
    return this.portal.overview(request.candidate.sub);
  }

  @Get('drafts/:vacancyId')
  draft(@Req() request: CandidateRequest, @Param('vacancyId') vacancyId: string) {
    return this.applications.getCandidateDraft(vacancyId, request.candidate.sub);
  }

  @Put('drafts/:vacancyId')
  saveDraft(@Req() request: CandidateRequest, @Param('vacancyId') vacancyId: string, @Body() body: { value: unknown }) {
    return this.applications.saveCandidateDraft(vacancyId, request.candidate.sub, body.value);
  }

  @Post(':id/withdraw')
  withdraw(
    @Req() request: CandidateRequest,
    @Param('id') id: string,
    @Body() dto: WithdrawCandidateApplicationDto,
  ) {
    return this.portal.withdraw(request.candidate.sub, id, dto.reason);
  }

  @Post('privacy-requests')
  requestPrivacy(@Req() request: CandidateRequest, @Body() dto: CreateCandidatePrivacyRequestDto) {
    return this.portal.requestPrivacy(request.candidate.sub, dto);
  }

  @Post('privacy-requests/:id/cancel')
  cancelPrivacy(@Req() request: CandidateRequest, @Param('id') id: string) {
    return this.portal.cancelPrivacy(request.candidate.sub, id);
  }

  @Post('communications/:id/read')
  markCommunicationRead(@Req() request: CandidateRequest, @Param('id') id: string) {
    return this.portal.markCommunicationRead(request.candidate.sub, id);
  }

  @Post('communications/:id/reply')
  replyToCommunication(@Req() request: CandidateRequest, @Param('id') id: string, @Body() dto: ReplyCandidateConversationDto) {
    return this.portal.replyToCommunication(request.candidate.sub, id, dto.message);
  }

  @Post('interviews/:id/reschedule')
  requestInterviewReschedule(@Req() request: CandidateRequest, @Param('id') id: string) {
    return this.portal.requestInterviewReschedule(request.candidate.sub, id);
  }

  @Post('support-requests')
  createSupportRequest(@Req() request: CandidateRequest, @Body() dto: CreateCandidateSupportRequestDto) {
    return this.portal.createSupportRequest(request.candidate.sub, dto);
  }

  @Post('resume/parse')
  @UseInterceptors(FileInterceptor('resume', { limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  parseResume(@UploadedFile() file: Express.Multer.File) {
    return this.portal.parseResume(file);
  }

  @Post('resume')
  @UseInterceptors(FileInterceptor('resume', { limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  uploadResume(@Req() request: CandidateRequest, @UploadedFile() file: Express.Multer.File) {
    return this.portal.uploadResume(request.candidate.sub, file);
  }

  @Get('resume/:id/access')
  resumeAccess(@Req() request: CandidateRequest, @Param('id') id: string) {
    return this.portal.resumeAccess(request.candidate.sub, id);
  }

  @Get('interviews/:id/invitation.ics')
  async interviewInvitation(
    @Req() request: CandidateRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const invitation = await this.portal.interviewInvitation(request.candidate.sub, id);
    response.setHeader('content-type', 'text/calendar; charset=utf-8');
    response.setHeader('content-disposition', `attachment; filename="${invitation.filename}"`);
    response.setHeader('cache-control', 'private, no-store');
    return invitation.content;
  }
}
