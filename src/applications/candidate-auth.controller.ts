import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
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
import { Public } from '../common/decorators/public.decorator';

@Controller('candidate-auth')
@Public()
export class CandidateAuthController {
  constructor(private readonly auth: CandidateAuthService) {}

  @RateLimit({ name: 'candidate-register', limit: 5, windowSeconds: 3600, scope: 'email' })
  @Post('register')
  async register(@Body() dto: CandidateRegisterDto, @Res({ passthrough: true }) response: Response) {
    return this.withSessionCookie(response, await this.auth.register(dto));
  }

  @RateLimit({ name: 'candidate-login', limit: 10, windowSeconds: 900, scope: 'email' })
  @Post('login')
  async login(@Body() dto: CandidateLoginDto, @Res({ passthrough: true }) response: Response) {
    return this.withSessionCookie(response, await this.auth.login(dto));
  }

  @RateLimit({ name: 'candidate-forgot-password', limit: 5, windowSeconds: 3600, scope: 'email' })
  @Post('forgot-password')
  forgotPassword(@Body() dto: CandidateForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.setHeader('Set-Cookie', `candidate_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`);
    return { loggedOut: true };
  }

  @RateLimit({ name: 'candidate-reset-password', limit: 10, windowSeconds: 3600 })
  @Post('reset-password')
  async resetPassword(@Body() dto: CandidateResetPasswordDto, @Res({ passthrough: true }) response: Response) {
    return this.withSessionCookie(response, await this.auth.resetPassword(dto.token, dto.password));
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
  async exchangeSocial(@Body() dto: CandidateSocialExchangeDto, @Res({ passthrough: true }) response: Response) {
    return this.withSessionCookie(response, await this.auth.exchangeSocial(dto.token));
  }

  private withSessionCookie<T extends { accessToken: string; expiresIn: number }>(response: Response, session: T) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.setHeader('Set-Cookie', `candidate_session=${encodeURIComponent(session.accessToken)}; Max-Age=${session.expiresIn}; Path=/; HttpOnly; SameSite=Lax${secure}`);
    return session;
  }
}
