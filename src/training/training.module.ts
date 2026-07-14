import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { TrainingAccessGuard } from './training-access.guard';

@Module({
  imports: [PrismaModule],
  controllers: [TrainingController],
  providers: [TrainingService, TrainingAccessGuard],
  exports: [TrainingService],
})
export class TrainingModule {}
