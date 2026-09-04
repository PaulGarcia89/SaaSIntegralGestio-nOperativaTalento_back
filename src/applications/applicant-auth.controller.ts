import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { Request, Response } from 'express';
import { ApplicantAuthService } from './applicant-auth.service';
import { ApplicantLoginDto, ApplicantRegisterDto } from './dto/applicant-auth.dto';
import { ApplicantAuthGuard, ApplicantRequest } from './applicant-auth.guard';
import { Public } from '../common/decorators/public.decorator';

const REFRESH_COOKIE = 'applicant_refresh_token';

@Controller('applicant-auth')
@Public()
export class ApplicantAuthController {
  constructor(private readonly auth: ApplicantAuthService) {}

  @RateLimit({ name: 'applicant-register', limit: 5, windowSeconds: 3600, scope: 'email' })
  @Post('register')
  async register(@Body() dto: ApplicantRegisterDto, @Res({ passthrough: true }) response: Response) { return this.writeSession(response, await this.auth.register(dto)); }

  @RateLimit({ name: 'applicant-login', limit: 10, windowSeconds: 900, scope: 'email' })
  @Post('login')
  async login(@Body() dto: ApplicantLoginDto, @Res({ passthrough: true }) response: Response) { return this.writeSession(response, await this.auth.login(dto)); }

  @RateLimit({ name: 'applicant-refresh', limit: 60, windowSeconds: 900 })
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) { return this.writeSession(response, await this.auth.refresh(this.readCookie(request, REFRESH_COOKIE))); }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Set-Cookie', `${REFRESH_COOKIE}=; Max-Age=0; Path=/api; HttpOnly; SameSite=Lax${this.secure()}`);
    return this.auth.logout(this.readCookie(request, REFRESH_COOKIE));
  }

  @Get('me')
  @UseGuards(ApplicantAuthGuard)
  me(@Req() request: ApplicantRequest) { return this.auth.me(request.applicant.sub); }

  private writeSession(response: Response, session: { refreshToken: string; accessToken: string; expiresIn: number; applicant: unknown }) {
    response.setHeader('Set-Cookie', `${REFRESH_COOKIE}=${encodeURIComponent(session.refreshToken)}; Max-Age=2592000; Path=/api; HttpOnly; SameSite=Lax${this.secure()}`);
    return { accessToken: session.accessToken, expiresIn: session.expiresIn, applicant: session.applicant };
  }
  private readCookie(request: Request, name: string) { return request.headers.cookie?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1); }
  private secure() { return process.env.NODE_ENV === 'production' ? '; Secure' : ''; }
}
