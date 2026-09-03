import { Module } from '@nestjs/common';
import { HiringController } from './hiring.controller';
import { HiringService } from './hiring.service';
import { SignaturesModule } from '../signatures/signatures.module';
import { JobOffersModule } from '../job-offers/job-offers.module';
import { HiringProgressResolver } from './hiring-progress.resolver';

@Module({
  imports: [SignaturesModule, JobOffersModule],
  controllers: [HiringController],
  providers: [HiringService, HiringProgressResolver],
})
export class HiringModule {}
