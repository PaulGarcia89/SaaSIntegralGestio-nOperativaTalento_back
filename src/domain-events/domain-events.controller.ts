import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { AutomationService } from '../automation/automation.service';
import { CandidateHiredDto } from './dto/candidate-hired.dto';
import { SimpleDomainEventDto } from './dto/simple-domain-event.dto';

@Controller('domain-events')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard)
export class DomainEventsController {
  constructor(private readonly automationService: AutomationService) {}

  @Post('candidate-hired')
  @RequirePermissions('domain_events.create')
  candidateHired(@Req() request: RequestWithUser, @Body() dto: CandidateHiredDto) {
    return this.automationService.processCandidateHired(request.user, dto);
  }

  @Post('branch-changed')
  @RequirePermissions('domain_events.create')
  branchChanged(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.automationService.processBranchChanged(request.user, dto);
  }

  @Post('offboarding-started')
  @RequirePermissions('domain_events.create')
  offboardingStarted(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.automationService.processOffboardingStarted(request.user, dto);
  }

  @Post('onboarding-completed')
  @RequirePermissions('domain_events.create')
  onboardingCompleted(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.automationService.processOnboardingCompleted(request.user, dto);
  }

  @Post('asset-assigned')
  @RequirePermissions('domain_events.create')
  assetAssigned(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.automationService.processAssetAssigned(request.user, dto);
  }

  @Post('training-completed')
  @RequirePermissions('domain_events.create')
  trainingCompleted(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.automationService.processTrainingCompleted(request.user, dto);
  }

  @Post('operation-handoff-completed')
  @RequirePermissions('domain_events.create')
  operationHandoffCompleted(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.automationService.processOperationHandoffCompleted(request.user, dto);
  }

  @Post('compliance-closed')
  @RequirePermissions('domain_events.create')
  complianceClosed(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.automationService.processComplianceClosed(request.user, dto);
  }
}
