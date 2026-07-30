import { Module } from '@nestjs/common';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PublicSignaturesController, SignaturesController } from './signatures.controller';
import { SignatureProviderService } from './signature-provider.service';
import { SignaturesService } from './signatures.service';

@Module({
  controllers: [SignaturesController, PublicSignaturesController],
  providers: [SignaturesService, SignatureProviderService, SubscriptionGuard, ModuleAccessGuard],
  exports: [SignaturesService],
})
export class SignaturesModule {}
