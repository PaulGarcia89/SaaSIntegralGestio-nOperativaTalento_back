import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AuditAction } from '../audit/audit-action.decorator';
import { AuthService } from './auth.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly authService: AuthService) {}

  @Get('context')
  @AuditAction('AUTH_ME_CONTEXT')
  context(@CurrentUser() user: JwtPayload) {
    return this.authService.getCurrentUser(user);
  }
}
