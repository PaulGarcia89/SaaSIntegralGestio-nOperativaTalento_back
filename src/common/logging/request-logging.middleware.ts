import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { RequestWithUser } from '../types/request-with-user.type';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('RequestLogger');

  use(request: RequestWithUser, response: Response, next: NextFunction) {
    const startedAt = Date.now();

    response.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      this.logger.log(
        JSON.stringify({
          type: 'request',
          tenantId: request.tenant?.id ?? request.user?.tenantId ?? null,
          branchId: request.branch?.id ?? request.user?.activeBranchId ?? null,
          userId: request.user?.sub ?? null,
          route: request.originalUrl ?? request.url,
          method: request.method,
          statusCode: response.statusCode,
          durationMs,
        }),
      );
    });

    next();
  }
}
