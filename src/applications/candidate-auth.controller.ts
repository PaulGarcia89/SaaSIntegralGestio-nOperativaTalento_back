import { Body, Controller, Post } from '@nestjs/common';
import { CandidateAuthService } from './candidate-auth.service';
import { CandidateLoginDto, CandidateRegisterDto } from './dto/candidate-auth.dto';

@Controller('candidate-auth')
export class CandidateAuthController {
  constructor(private readonly auth: CandidateAuthService) {}

  @Post('register')
  register(@Body() dto: CandidateRegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: CandidateLoginDto) {
    return this.auth.login(dto);
  }
}
