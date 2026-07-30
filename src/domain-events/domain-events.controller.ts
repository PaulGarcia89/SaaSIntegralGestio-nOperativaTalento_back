import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { CandidateHiredDto } from './dto/candidate-hired.dto';
import { SimpleDomainEventDto } from './dto/simple-domain-event.dto';
import { DomainEventsService } from './domain-events.service';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { ModuleCode } from '@prisma/client';

@Controller('domain-events')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, PermissionGuard)
export class DomainEventsController {
  constructor(private readonly domainEventsService: DomainEventsService) {}

  @Post('candidate-hired')
  @RequireModule(ModuleCode.ATS)
  @RequirePermissions('domain_events.candidate_hired')
  candidateHired(@Req() request: RequestWithUser, @Body() dto: CandidateHiredDto) {
    return this.domainEventsService.candidateHired(request.user, dto, {
      correlationId: request.requestId,
    });
  }

  @Post('branch-changed')
  @RequireModule(ModuleCode.ONBOARDING)
  @RequirePermissions('domain_events.branch_changed')
  branchChanged(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.domainEventsService.branchChanged(request.user, dto, {
      correlationId: request.requestId,
    });
  }

  @Post('offboarding-started')
  @RequireModule(ModuleCode.ONBOARDING)
  @RequirePermissions('domain_events.offboarding_started')
  offboardingStarted(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.domainEventsService.offboardingStarted(request.user, dto, {
      correlationId: request.requestId,
    });
  }

  @Post('onboarding-completed')
  @RequireModule(ModuleCode.ONBOARDING)
  @RequirePermissions('domain_events.onboarding_completed')
  onboardingCompleted(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.domainEventsService.onboardingCompleted(request.user, dto, {
      correlationId: request.requestId,
    });
  }

  @Post('asset-assigned')
  @RequireModule(ModuleCode.INVENTORY)
  @RequirePermissions('domain_events.asset_assigned')
  assetAssigned(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.domainEventsService.assetAssigned(request.user, dto, {
      correlationId: request.requestId,
    });
  }

  @Post('training-completed')
  @RequireModule(ModuleCode.TRAINING)
  @RequirePermissions('domain_events.training_completed')
  trainingCompleted(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.domainEventsService.trainingCompleted(request.user, dto, {
      correlationId: request.requestId,
    });
  }

  @Post('operation-handoff-completed')
  @RequireModule(ModuleCode.ONBOARDING)
  @RequirePermissions('domain_events.operation_handoff_completed')
  operationHandoffCompleted(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.domainEventsService.operationHandoffCompleted(request.user, dto, {
      correlationId: request.requestId,
    });
  }

  @Post('compliance-closed')
  @RequireModule(ModuleCode.ONBOARDING)
  @RequirePermissions('domain_events.compliance_closed')
  complianceClosed(@Req() request: RequestWithUser, @Body() dto: SimpleDomainEventDto) {
    return this.domainEventsService.complianceClosed(request.user, dto, {
      correlationId: request.requestId,
    });
  }
}
