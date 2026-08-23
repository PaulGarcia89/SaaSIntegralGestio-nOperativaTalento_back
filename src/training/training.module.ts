import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { TrainingAccessGuard } from './training-access.guard';
import { TrainingAdminController } from './training-admin.controller';
import { TrainingAdminService } from './training-admin.service';
import { TrainingCourseSchedulerService } from './training-course-scheduler.service';
import { TrainingAssignmentAdminController } from './training-assignment-admin.controller';
import { TrainingAssignmentAdminService } from './training-assignment-admin.service';
import { TrainingAssignmentReminderService } from './training-assignment-reminder.service';
import {
  PublicTrainingCertificateController,
  TrainingAssessmentAdminController,
} from './training-assessment-admin.controller';
import { TrainingAssessmentAdminService } from './training-assessment-admin.service';
import { TrainingAnalyticsController } from './training-analytics.controller';
import { TrainingAnalyticsService } from './training-analytics.service';
import { PublicTrainingScormController, TrainingIntegrationsController } from './training-integrations.controller';
import { TrainingIntegrationsService } from './training-integrations.service';
import { TrainingScormStorageService } from './training-scorm-storage.service';
import { TrainingWebhookDeliveryService } from './training-webhook-delivery.service';
import { TrainingObjectStorageService } from './training-object-storage.service';
import { TrainingAntivirusService } from './training-antivirus.service';
import { TrainingLearningPathController } from './training-learning-path.controller';
import { TrainingLearningPathService } from './training-learning-path.service';
import { TrainingLaunchController } from './training-launch.controller';
import { TrainingLaunchService } from './training-launch.service';
import { TrainingOperationsController } from './training-operations.controller';
import { TrainingOperationsService } from './training-operations.service';
import { TrainingVideoController, TrainingVideoAdminController } from './training-video.controller';
import { TrainingVideoService } from './training-video.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    TrainingController,
    TrainingAdminController,
    TrainingAssignmentAdminController,
    TrainingAssessmentAdminController,
    PublicTrainingCertificateController,
    TrainingAnalyticsController,
    TrainingIntegrationsController,
    PublicTrainingScormController,
    TrainingLearningPathController,
    TrainingLaunchController,
    TrainingOperationsController,
    TrainingVideoController,
    TrainingVideoAdminController,
  ],
  providers: [
    TrainingService,
    TrainingAdminService,
    TrainingCourseSchedulerService,
    TrainingAssignmentAdminService,
    TrainingAssignmentReminderService,
    TrainingAssessmentAdminService,
    TrainingAnalyticsService,
    TrainingIntegrationsService,
    TrainingScormStorageService,
    TrainingWebhookDeliveryService,
    TrainingObjectStorageService,
    TrainingAntivirusService,
    TrainingAccessGuard,
    TrainingLearningPathService,
    TrainingLaunchService,
    TrainingOperationsService,
    TrainingVideoService,
  ],
  exports: [TrainingService, TrainingAntivirusService, TrainingLearningPathService],
})
export class TrainingModule {}
