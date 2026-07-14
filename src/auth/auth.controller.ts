import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AuditAction } from '../audit/audit-action.decorator';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @AuditAction('AUTH_LOGIN')
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, request);
  }

  @Post('refresh')
  @AuditAction('AUTH_REFRESH')
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(dto, request);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @AuditAction('AUTH_ME')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getCurrentUser(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  @AuditAction('AUTH_SESSIONS')
  sessions(@CurrentUser() user: JwtPayload) {
    return this.authService.getSessions(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @AuditAction('AUTH_LOGOUT')
  logout(@CurrentUser() user: JwtPayload) {
    return this.authService.logout(user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:sessionId')
  @AuditAction('AUTH_REVOKE_SESSION')
  revokeSession(@CurrentUser() user: JwtPayload, @Param('sessionId') sessionId: string) {
    return this.authService.revokeSession(user, sessionId);
  }
}
