import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { AUDIT_ACTION_KEY } from './audit.constants';

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const auditAction = this.reflector.getAllAndOverride<string | undefined>(AUDIT_ACTION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (auditAction) {
        const request = context.switchToHttp().getRequest<RequestWithUser>();
        request.auditAction = auditAction;
      }
    }

    return next.handle();
  }
}
