import { forwardRef, Module } from "@nestjs/common";
import { ApplicationsModule } from "../applications/applications.module";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { SubscriptionGuard } from "../common/guards/subscription.guard";
import { AtsCommunicationsModule } from "../ats-communications/ats-communications.module";
import { CalendarTokenCryptoService } from "./calendar-token-crypto.service";
import { InterviewCalendarService } from "./interview-calendar.service";
import { RecruitmentController } from "./recruitment.controller";
import { RecruitmentService } from "./recruitment.service";
import { ScorecardsService } from "./scorecards.service";
import { InterviewSelfSchedulingService } from "./interview-self-scheduling.service";
import { InterviewSelfSchedulingController } from "./interview-self-scheduling.controller";
import { NotificationsModule } from "../notifications/notifications.module";
import { CompetencyAiProviderService } from "./competency-ai-provider.service";
import { CompetencyAiAssessmentService } from "./competency-ai-assessment.service";
import { DomainEventsModule } from "../domain-events/domain-events.module";

@Module({
  imports: [AtsCommunicationsModule, NotificationsModule, DomainEventsModule, forwardRef(() => ApplicationsModule)],
  controllers: [RecruitmentController, InterviewSelfSchedulingController],
  providers: [
    RecruitmentService,
    ScorecardsService,
    InterviewCalendarService,
    CalendarTokenCryptoService,
    InterviewSelfSchedulingService,
    CompetencyAiProviderService,
    CompetencyAiAssessmentService,
    SubscriptionGuard,
    ModuleAccessGuard,
  ],
  exports: [InterviewCalendarService, ScorecardsService],
})
export class RecruitmentModule {}
