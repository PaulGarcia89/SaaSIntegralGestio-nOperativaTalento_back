import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ModuleCode } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { TenantWide } from '../common/decorators/tenant-wide.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RequestWithUser } from '../common/types/request-with-user.type';
import {
  CandidateRelationDto,
  CreateTalentActivityDto,
  CreateTalentPoolDto,
  CreateTalentTagDto,
  ListDuplicateCandidatesDto,
  ListTalentCandidatesDto,
  MergeCandidatesDto,
  TagCandidateDto,
  UpdateTalentCandidateDto,
  UpdateTalentPoolDto,
  CreateTalentSegmentDto,
  CreateTalentCampaignDto,
  CreateTalentSequenceDto,
  EnrollTalentSequenceDto,
  TalentSegmentFiltersDto,
} from './dto/talent-crm.dto';
import { TalentCrmService } from './talent-crm.service';

@Controller('talent-crm')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard)
@TenantWide()
@RequireModule(ModuleCode.ATS)
export class TalentCrmController {
  constructor(private readonly talentCrm: TalentCrmService) {}

  @Get('candidates')
  @RequirePermissions('applications.read')
  candidates(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Query() query: ListTalentCandidatesDto) {
    return this.talentCrm.listCandidates(actor, request.tenant!.id, query);
  }

  @Get('candidates/:id')
  @RequirePermissions('applications.read')
  candidate(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string) {
    return this.talentCrm.getCandidate(actor, request.tenant!.id, id);
  }

  @Patch('candidates/:id')
  @RequirePermissions('applications.update')
  updateCandidate(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: UpdateTalentCandidateDto) {
    return this.talentCrm.updateCandidate(actor, request.tenant!.id, id, dto);
  }

  @Post('candidates/:id/activities')
  @RequirePermissions('applications.update')
  createActivity(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: CreateTalentActivityDto) {
    return this.talentCrm.createActivity(actor, request.tenant!.id, id, dto);
  }

  @Post('candidates/:id/tags')
  @RequirePermissions('applications.update')
  addTag(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: TagCandidateDto) {
    return this.talentCrm.addTag(actor, request.tenant!.id, id, dto.tagId);
  }

  @Delete('candidates/:id/tags/:tagId')
  @RequirePermissions('applications.update')
  removeTag(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Param('tagId') tagId: string) {
    return this.talentCrm.removeTag(actor, request.tenant!.id, id, tagId);
  }

  @Get('pools')
  @RequirePermissions('applications.read')
  pools(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload) {
    return this.talentCrm.listPools(actor, request.tenant!.id);
  }

  @Post('pools')
  @RequirePermissions('applications.update')
  createPool(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Body() dto: CreateTalentPoolDto) {
    return this.talentCrm.createPool(actor, request.tenant!.id, dto);
  }

  @Patch('pools/:id')
  @RequirePermissions('applications.update')
  updatePool(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: UpdateTalentPoolDto) {
    return this.talentCrm.updatePool(actor, request.tenant!.id, id, dto);
  }

  @Post('pools/:id/members')
  @RequirePermissions('applications.update')
  addPoolMember(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: CandidateRelationDto) {
    return this.talentCrm.addPoolMember(actor, request.tenant!.id, id, dto.candidateId);
  }

  @Delete('pools/:id/members/:candidateId')
  @RequirePermissions('applications.update')
  removePoolMember(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Param('candidateId') candidateId: string) {
    return this.talentCrm.removePoolMember(actor, request.tenant!.id, id, candidateId);
  }

  @Get('tags')
  @RequirePermissions('applications.read')
  tags(@Req() request: RequestWithUser) {
    return this.talentCrm.listTags(request.tenant!.id);
  }

  @Post('tags')
  @RequirePermissions('applications.update')
  createTag(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Body() dto: CreateTalentTagDto) {
    return this.talentCrm.createTag(actor, request.tenant!.id, dto);
  }

  @Get('duplicates')
  @RequirePermissions('applications.read')
  duplicates(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Query() query: ListDuplicateCandidatesDto) {
    return this.talentCrm.findDuplicates(actor, request.tenant!.id, query);
  }

  @Post('duplicates/merge')
  @RequirePermissions('applications.update')
  merge(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Body() dto: MergeCandidatesDto) {
    return this.talentCrm.mergeCandidates(actor, request.tenant!.id, dto);
  }

  @Get('segments')
  @RequirePermissions('applications.read')
  segments(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload) {
    return this.talentCrm.listSegments(actor, request.tenant!.id);
  }

  @Post('segments')
  @RequirePermissions('applications.update')
  createSegment(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Body() dto: CreateTalentSegmentDto) {
    return this.talentCrm.createSegment(actor, request.tenant!.id, dto);
  }

  @Get('segments/:id/preview')
  @RequirePermissions('applications.read')
  previewSegment(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string) {
    return this.talentCrm.previewSegment(actor, request.tenant!.id, id);
  }

  @Get('rediscovery')
  @RequirePermissions('applications.read')
  rediscovery(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Query() query: TalentSegmentFiltersDto) {
    return this.talentCrm.rediscoverCandidates(actor, request.tenant!.id, query);
  }

  @Get('campaigns')
  @RequirePermissions('applications.read')
  campaigns(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload) {
    return this.talentCrm.listCampaigns(actor, request.tenant!.id);
  }

  @Post('campaigns')
  @RequirePermissions('applications.update')
  createCampaign(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Body() dto: CreateTalentCampaignDto) {
    return this.talentCrm.createCampaign(actor, request.tenant!.id, dto);
  }

  @Post('campaigns/:id/launch')
  @RequirePermissions('applications.update')
  launchCampaign(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string) {
    return this.talentCrm.launchCampaign(actor, request.tenant!.id, id);
  }

  @Get('campaigns/:id/metrics')
  @RequirePermissions('applications.read')
  campaignMetrics(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string) {
    return this.talentCrm.campaignMetrics(actor, request.tenant!.id, id);
  }

  @Get('sequences')
  @RequirePermissions('applications.read')
  sequences(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload) {
    return this.talentCrm.listSequences(actor, request.tenant!.id);
  }

  @Post('sequences')
  @RequirePermissions('applications.update')
  createSequence(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Body() dto: CreateTalentSequenceDto) {
    return this.talentCrm.createSequence(actor, request.tenant!.id, dto);
  }

  @Post('sequences/:id/enroll')
  @RequirePermissions('applications.update')
  enrollSequence(@Req() request: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: EnrollTalentSequenceDto) {
    return this.talentCrm.enrollSequence(actor, request.tenant!.id, id, dto);
  }
}
