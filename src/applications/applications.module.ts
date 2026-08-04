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
import { AtsPrivateFileService } from '../common/files/ats-private-file.service';
import { AtsFileAccessController } from '../common/files/ats-file-access.controller';
import { TrainingAntivirusService } from '../training/training-antivirus.service';
import { AtsCommunicationsModule } from '../ats-communications/ats-communications.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CandidatePortalService } from './candidate-portal.service';
import { ApplicationSlaService } from './application-sla.service';
import { ApplicationSlaSchedulerService } from './application-sla-scheduler.service';
import { TalentCrmController } from './talent-crm.controller';
import { TalentCrmService } from './talent-crm.service';

@Module({
  imports: [JwtModule.register({}), AtsCommunicationsModule, NotificationsModule],
  controllers: [
    ApplicationsController,
    PublicApplicationsController,
    CandidateAuthController,
    CandidateApplicationsController,
    AtsFileAccessController,
    TalentCrmController,
  ],
  providers: [
    ApplicationsService,
    SubscriptionGuard,
    ModuleAccessGuard,
    CandidateAuthService,
    CandidateAuthGuard,
    CandidatePortalService,
    AtsPrivateFileService,
    TrainingAntivirusService,
    ApplicationSlaService,
    ApplicationSlaSchedulerService,
    TalentCrmService,
  ],
})
export class ApplicationsModule {}
