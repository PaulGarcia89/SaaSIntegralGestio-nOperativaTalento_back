import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CandidateAuthGuard } from '../applications/candidate-auth.guard';
import { AtsCommunicationsModule } from '../ats-communications/ats-communications.module';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { WorkflowsModule } from '../workflows/workflows.module';
import { CandidateJobOffersController, JobOffersController } from './job-offers.controller';
import { JobOffersService } from './job-offers.service';

@Module({
  imports: [JwtModule.register({}), AtsCommunicationsModule, WorkflowsModule],
  controllers: [JobOffersController, CandidateJobOffersController],
  providers: [JobOffersService, CandidateAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard],
  exports: [JobOffersService],
})
export class JobOffersModule {}
