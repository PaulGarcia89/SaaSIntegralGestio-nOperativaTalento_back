import { Module } from '@nestjs/common';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PublicSignaturesController, SignaturesController } from './signatures.controller';
import { SignatureProviderService } from './signature-provider.service';
import { SignaturesService } from './signatures.service';
import { JobOffersModule } from '../job-offers/job-offers.module';
import { EnterpriseIntegrationsModule } from '../enterprise-integrations/enterprise-integrations.module';

@Module({
  imports: [JobOffersModule, EnterpriseIntegrationsModule],
  controllers: [SignaturesController, PublicSignaturesController],
  providers: [SignaturesService, SignatureProviderService, SubscriptionGuard, ModuleAccessGuard],
  exports: [SignaturesService],
})
export class SignaturesModule {}
