import { Module } from "@nestjs/common";
import { ModuleAccessGuard } from "../common/guards/module-access.guard";
import { SubscriptionGuard } from "../common/guards/subscription.guard";
import { AtsCommunicationsModule } from "../ats-communications/ats-communications.module";
import { CalendarTokenCryptoService } from "./calendar-token-crypto.service";
import { InterviewCalendarService } from "./interview-calendar.service";
import { RecruitmentController } from "./recruitment.controller";
import { RecruitmentService } from "./recruitment.service";
import { ScorecardsService } from "./scorecards.service";

@Module({
  imports: [AtsCommunicationsModule],
  controllers: [RecruitmentController],
  providers: [
    RecruitmentService,
    ScorecardsService,
    InterviewCalendarService,
    CalendarTokenCryptoService,
    SubscriptionGuard,
    ModuleAccessGuard,
  ],
  exports: [InterviewCalendarService],
})
export class RecruitmentModule {}
