import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
import { RequestWithUser } from '../common/types/request-with-user.type';

@Injectable()
export class RestaurantInventoryResponseInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RestaurantInventoryPerformance');
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const startedAt = Date.now(); const route = request.route?.path ?? request.originalUrl;
    return next.handle().pipe(
      map((data) => ({ data, meta: { requestId: request.requestId ?? null, context: request.restaurantInventoryContext ?? { companyId: request.tenant?.id ?? null, branchId: null, warehouseId: null } } })),
      catchError((error) => { this.logger.error(JSON.stringify({ type: 'inventory_error', route, method: request.method, durationMs: Date.now() - startedAt, code: error?.response?.code ?? error?.code ?? 'INTERNAL_ERROR' })); return throwError(() => error); }),
      finalize(() => { this.logger.log(JSON.stringify({ type: 'inventory_performance', route, method: request.method, durationMs: Date.now() - startedAt, tenantId: request.tenant?.id ?? null })); }),
    );
  }
}
