import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { CandidateAuthGuard, CandidateRequest } from '../applications/candidate-auth.guard';
import { Response } from 'express';
import {
  CounterJobOfferDto,
  CreateJobOfferDto,
  DecideJobOfferApprovalDto,
  RespondJobOfferDto,
} from './dto/job-offer.dto';
import { JobOffersService } from './job-offers.service';

@Controller('ats/offers')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard)
export class JobOffersController {
  constructor(private readonly offers: JobOffersService) {}

  @Get('applications/:applicationId')
  @RequirePermissions('applications.read')
  list(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('applicationId') applicationId: string) {
    return this.offers.listForApplication(request.tenant!.id, actor, applicationId);
  }

  @Post('applications/:applicationId')
  @RequirePermissions('applications.update')
  create(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('applicationId') applicationId: string, @Body() dto: CreateJobOfferDto) {
    return this.offers.create(request.tenant!.id, actor, applicationId, dto);
  }

  @Post(':id/versions')
  @RequirePermissions('applications.update')
  revise(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: CreateJobOfferDto) {
    return this.offers.revise(request.tenant!.id, actor, id, dto);
  }

  @Post(':id/approvals')
  @RequirePermissions('applications.update')
  approve(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: DecideJobOfferApprovalDto) {
    return this.offers.decideApproval(request.tenant!.id, actor, id, dto);
  }

  @Post(':id/send')
  @RequirePermissions('applications.update')
  send(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string) {
    return this.offers.send(request.tenant!.id, actor, id);
  }

  @Post(':id/retry-conversion')
  @RequirePermissions('applications.update')
  retryConversion(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string) {
    return this.offers.retryConversion(request.tenant!.id, actor, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('applications.update')
  cancel(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.offers.cancel(request.tenant!.id, actor, id, reason);
  }

  @Get(':id/pdf')
  @RequirePermissions('applications.read')
  async pdf(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Query('version', new ParseIntPipe({ optional: true })) version: number | undefined, @Res() response: Response) {
    const file = await this.offers.pdfForStaff(request.tenant!.id, actor, id, version);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.send(file.buffer);
  }
}

@Controller('candidate/offers')
@UseGuards(CandidateAuthGuard)
export class CandidateJobOffersController {
  constructor(private readonly offers: JobOffersService) {}

  @Get()
  list(@Req() request: CandidateRequest) { return this.offers.listForCandidate(request.candidate.sub); }

  @Get(':id/pdf')
  async pdf(@Req() request: CandidateRequest, @Param('id') id: string, @Query('version', new ParseIntPipe({ optional: true })) version: number | undefined, @Res() response: Response) {
    const file = await this.offers.candidatePdf(request.candidate.sub, id, version);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.send(file.buffer);
  }

  @Post(':id/signing-link')
  signingLink(@Req() request: CandidateRequest, @Param('id') id: string) {
    return this.offers.candidateSigningLink(request.candidate.sub, id);
  }

  @Post(':id/respond')
  respond(@Req() request: CandidateRequest, @Param('id') id: string, @Body() dto: RespondJobOfferDto) {
    return this.offers.candidateRespond(request.candidate.sub, id, dto);
  }

  @Post(':id/counter')
  counter(@Req() request: CandidateRequest, @Param('id') id: string, @Body() dto: CounterJobOfferDto) {
    return this.offers.counter(request.candidate.sub, id, dto);
  }
}
