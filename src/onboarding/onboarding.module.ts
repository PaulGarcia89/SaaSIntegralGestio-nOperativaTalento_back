import { Module } from '@nestjs/common';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CandidatePreboardingController, OnboardingController } from './onboarding.controller';
import { OnboardingDocumentStorageService } from './onboarding-document-storage.service';
import { OnboardingService } from './onboarding.service';
import { OnboardingAutomationService } from './onboarding-automation.service';
import { TrainingModule } from '../training/training.module';
import { ApplicationsModule } from '../applications/applications.module';
import { CandidatePreboardingService } from './candidate-preboarding.service';
import { OnboardingAnalyticsService } from './onboarding-analytics.service';

@Module({
  imports: [TrainingModule, ApplicationsModule],
  controllers: [OnboardingController, CandidatePreboardingController],
  providers: [OnboardingService, OnboardingDocumentStorageService, OnboardingAutomationService, OnboardingAnalyticsService, CandidatePreboardingService, SubscriptionGuard, ModuleAccessGuard],
  exports: [OnboardingService],
})
export class OnboardingModule {}
