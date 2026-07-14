import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { AuditService } from './audit.service';
import { RequestWithUser } from '../common/types/request-with-user.type';

@Injectable()
export class AuditLogMiddleware implements NestMiddleware {
  constructor(private readonly auditService: AuditService) {}

  use(request: RequestWithUser, response: Response, next: NextFunction) {
    response.on('finish', () => {
      void this.auditService.logHttpRequest(request, response.statusCode);
    });

    next();
  }
}
