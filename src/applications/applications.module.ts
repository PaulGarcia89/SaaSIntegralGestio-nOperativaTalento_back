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

@Module({
  imports: [JwtModule.register({})],
  controllers: [
    ApplicationsController,
    PublicApplicationsController,
    CandidateAuthController,
    CandidateApplicationsController,
  ],
  providers: [
    ApplicationsService,
    SubscriptionGuard,
    ModuleAccessGuard,
    CandidateAuthService,
    CandidateAuthGuard,
  ],
})
export class ApplicationsModule {}
