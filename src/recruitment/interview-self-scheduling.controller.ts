import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BookInterviewSlotDto } from './dto/recruitment.dto';
import { InterviewSelfSchedulingService } from './interview-self-scheduling.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('public/interview-scheduling')
@Public()
export class InterviewSelfSchedulingController {
  constructor(private readonly service: InterviewSelfSchedulingService) {}

  @Get(':token')
  context(@Param('token') token: string) { return this.service.publicContext(token); }

  @Post(':token/book')
  book(@Param('token') token: string, @Body() dto: BookInterviewSlotDto) { return this.service.book(token, dto); }
}
