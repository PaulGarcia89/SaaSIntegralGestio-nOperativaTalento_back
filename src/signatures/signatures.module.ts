import { Module } from '@nestjs/common';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { DocuSealWebhookController, PublicSignaturesController, SignaturesController } from './signatures.controller';
import { SignatureProviderService } from './signature-provider.service';
import { SignaturesService } from './signatures.service';
import { JobOffersModule } from '../job-offers/job-offers.module';
import { EnterpriseIntegrationsModule } from '../enterprise-integrations/enterprise-integrations.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { DocuSealService } from './docuseal.service';

@Module({
  imports: [JobOffersModule, EnterpriseIntegrationsModule, OnboardingModule],
  controllers: [SignaturesController, PublicSignaturesController, DocuSealWebhookController],
  providers: [SignaturesService, SignatureProviderService, DocuSealService, SubscriptionGuard, ModuleAccessGuard],
  exports: [SignaturesService],
})
export class SignaturesModule {}
