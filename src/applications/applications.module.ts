import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { PublicApplicationsController } from './public-applications.controller';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { CandidateApplicationsController } from './candidate-applications.controller';
import { CandidateAuthController } from './candidate-auth.controller';
import { CandidateAuthGuard } from './candidate-auth.guard';
import { CandidateAuthService } from './candidate-auth.service';
import { TrainingAntivirusService } from '../training/training-antivirus.service';
import { AtsCommunicationsModule } from '../ats-communications/ats-communications.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CandidatePortalService } from './candidate-portal.service';
import { ApplicationSlaService } from './application-sla.service';
import { ApplicationSlaSchedulerService } from './application-sla-scheduler.service';
import { TalentCrmController } from './talent-crm.controller';
import { TalentCrmService } from './talent-crm.service';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { DomainEventsModule } from '../domain-events/domain-events.module';
import { ApplicantAuthController } from './applicant-auth.controller';
import { ApplicantAuthGuard } from './applicant-auth.guard';
import { ApplicantAuthService } from './applicant-auth.service';

@Module({
  imports: [JwtModule.register({}), AtsCommunicationsModule, NotificationsModule, RecruitmentModule, DomainEventsModule],
  controllers: [
    ApplicationsController,
    PublicApplicationsController,
    CandidateAuthController,
    CandidateApplicationsController,
    TalentCrmController,
    ApplicantAuthController,
  ],
  providers: [
    ApplicationsService,
    SubscriptionGuard,
    ModuleAccessGuard,
    CandidateAuthService,
    CandidateAuthGuard,
    CandidatePortalService,
    TrainingAntivirusService,
    ApplicationSlaService,
    ApplicationSlaSchedulerService,
    TalentCrmService,
    ApplicantAuthService,
    ApplicantAuthGuard,
  ],
})
export class ApplicationsModule {}
