import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AuditAction } from '../audit/audit-action.decorator';
import { Request, Response } from 'express';
import { UpdateActiveBranchDto } from './dto/update-active-branch.dto';
import { UpdateActiveTenantDto } from './dto/update-active-tenant.dto';
import { StartImpersonationDto } from './dto/start-impersonation.dto';
import { CreateWorkspaceViewDto, UpdateWorkspaceViewDto } from './dto/workspace-view.dto';
import {
  clearRefreshTokenCookie,
  extractRefreshTokenFromRequest,
  setRefreshTokenCookie,
} from './auth-cookie.util';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @AuditAction('AUTH_LOGIN')
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto, request);
    setRefreshTokenCookie(response, result.refreshToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Post('refresh')
  @AuditAction('AUTH_REFRESH')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.refresh(
      {
        refreshToken: dto.refreshToken ?? extractRefreshTokenFromRequest(request) ?? undefined,
      },
      request,
    );
    setRefreshTokenCookie(response, result.refreshToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @AuditAction('AUTH_ME')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getCurrentUser(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('preferences')
  @AuditAction('AUTH_PREFERENCES_LIST')
  preferences(@CurrentUser() user: JwtPayload) {
    return this.authService.getPreferences(user);
  }

  @UseGuards(JwtAuthGuard)
  @Put('preferences/:namespace')
  @AuditAction('AUTH_PREFERENCES_UPDATE')
  updatePreferences(
    @CurrentUser() user: JwtPayload,
    @Param('namespace') namespace: string,
    @Body() body: { value: unknown },
  ) {
    return this.authService.updatePreference(user, namespace, body.value);
  }

  @UseGuards(JwtAuthGuard)
  @Get('workspace-views')
  @AuditAction('WORKSPACE_VIEWS_LIST')
  workspaceViews(@CurrentUser() user: JwtPayload, @Query('module') module: string, @Query('screen') screen: string, @Query('workspaceKey') workspaceKey?: string) {
    return this.authService.listWorkspaceViews(user, module, screen, workspaceKey);
  }

  @UseGuards(JwtAuthGuard)
  @Post('workspace-views')
  @AuditAction('WORKSPACE_VIEW_CREATE')
  createWorkspaceView(@CurrentUser() user: JwtPayload, @Body() body: CreateWorkspaceViewDto) {
    return this.authService.createWorkspaceView(user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Put('workspace-views/:id')
  @AuditAction('WORKSPACE_VIEW_UPDATE')
  updateWorkspaceView(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: UpdateWorkspaceViewDto) {
    return this.authService.updateWorkspaceView(user, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('workspace-views/:id')
  @AuditAction('WORKSPACE_VIEW_DELETE')
  deleteWorkspaceView(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.authService.deleteWorkspaceView(user, id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('context/branch')
  @AuditAction('AUTH_UPDATE_BRANCH_CONTEXT')
  updateActiveBranch(@CurrentUser() user: JwtPayload, @Body() dto: UpdateActiveBranchDto) {
    return this.authService.updateActiveBranch(user, dto.branchId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('context/tenant')
  @AuditAction('AUTH_UPDATE_TENANT_CONTEXT')
  updateActiveTenant(@CurrentUser() user: JwtPayload, @Body() dto: UpdateActiveTenantDto) {
    return this.authService.updateActiveTenant(user, dto.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('impersonation/start')
  @AuditAction('AUTH_IMPERSONATION_START')
  startImpersonation(@CurrentUser() user: JwtPayload, @Body() dto: StartImpersonationDto) {
    return this.authService.startImpersonation(user, dto.tenantId, dto.reason);
  }

  @UseGuards(JwtAuthGuard)
  @Post('impersonation/stop')
  @AuditAction('AUTH_IMPERSONATION_STOP')
  stopImpersonation(@CurrentUser() user: JwtPayload) {
    return this.authService.stopImpersonation(user);
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
  async logout(@CurrentUser() user: JwtPayload, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.logout(user);
    clearRefreshTokenCookie(response);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:sessionId')
  @AuditAction('AUTH_REVOKE_SESSION')
  revokeSession(@CurrentUser() user: JwtPayload, @Param('sessionId') sessionId: string) {
    return this.authService.revokeSession(user, sessionId);
  }
}
