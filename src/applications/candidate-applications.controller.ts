import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CandidateAuthGuard, CandidateRequest } from './candidate-auth.guard';

@Controller('candidate/applications')
@UseGuards(CandidateAuthGuard)
export class CandidateApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  findMine(@Req() request: CandidateRequest) {
    return this.applications.listForCandidate(request.candidate.sub);
  }
}
