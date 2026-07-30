import { Module } from '@nestjs/common';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { OnboardingController } from './onboarding.controller';
import { OnboardingDocumentStorageService } from './onboarding-document-storage.service';
import { OnboardingService } from './onboarding.service';
import { TrainingModule } from '../training/training.module';

@Module({
  imports: [TrainingModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingDocumentStorageService, SubscriptionGuard, ModuleAccessGuard],
  exports: [OnboardingService],
})
export class OnboardingModule {}
