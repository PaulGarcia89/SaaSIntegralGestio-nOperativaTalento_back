import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CandidateAuthService } from './candidate-auth.service';
import {
  CandidateForgotPasswordDto,
  CandidateLoginDto,
  CandidateProfileDto,
  CandidateRegisterDto,
  CandidateResetPasswordDto,
  CandidateSocialExchangeDto,
} from './dto/candidate-auth.dto';
import { CandidateAuthGuard, CandidateRequest } from './candidate-auth.guard';

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

  @Post('forgot-password')
  forgotPassword(@Body() dto: CandidateForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: CandidateResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Get('profile')
  @UseGuards(CandidateAuthGuard)
  profile(@Req() request: CandidateRequest) {
    return this.auth.profile(request.candidate.sub);
  }

  @Patch('profile')
  @UseGuards(CandidateAuthGuard)
  updateProfile(@Req() request: CandidateRequest, @Body() dto: CandidateProfileDto) {
    return this.auth.updateProfile(request.candidate.sub, dto);
  }

  @Get('social/:provider/start')
  startSocial(@Param('provider') provider: string, @Query('returnUrl') returnUrl?: string) {
    return this.auth.startSocial(provider, returnUrl);
  }

  @Get('social/:provider/callback')
  async socialCallback(
    @Param('provider') provider: string,
    @Query('state') state: string,
    @Query('code') code: string,
    @Res() response: Response,
  ) {
    response.redirect(await this.auth.completeSocial(provider, state, code));
  }

  @Post('social/exchange')
  exchangeSocial(@Body() dto: CandidateSocialExchangeDto) {
    return this.auth.exchangeSocial(dto.token);
  }
}
