import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import { createHash } from 'crypto';
import { from, Observable, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-code.enum';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).sort().reduce((out, key) => { out[key] = stable((value as Record<string, unknown>)[key]); return out; }, {} as Record<string, unknown>);
  return value;
}

@Injectable()
export class RestaurantInventoryIdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const key = request.header('Idempotency-Key')?.trim();
    const userId = request.user?.sub;
    const tenantId = request.tenant?.id;
    const method = request.method.toUpperCase();
    if (!key || !userId || !tenantId || ['GET', 'HEAD', 'OPTIONS'].includes(method)) return next.handle();

    const endpoint = request.route?.path ?? request.path;
    const body = { query: request.query, params: request.params, body: request.body, file: request.file ? { name: request.file.originalname, size: request.file.size, hash: createHash('sha256').update(request.file.buffer ?? Buffer.alloc(0)).digest('hex') } : null };
    const payloadHash = createHash('sha256').update(JSON.stringify(stable(body))).digest('hex');
    const where = { tenantId_userId_method_endpoint_idempotencyKey: { tenantId, userId, method, endpoint, idempotencyKey: key } };
    return from(this.prisma.restaurantInventoryIdempotencyRecord.findUnique({ where })).pipe(
      mergeMap((existing: any) => {
        if (existing) {
          if (existing.payloadHash !== payloadHash) throw new AppException('Idempotency-Key was already used with a different payload', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT);
          return of(existing.responseJson);
        }
        return next.handle().pipe(mergeMap((result) => from(this.persist(tenantId, userId, method, endpoint, key, payloadHash, result).then(() => result))));
      }),
      catchError(async (error: any) => {
        if (error?.code !== 'P2002') throw error;
        const existing = await this.prisma.restaurantInventoryIdempotencyRecord.findUnique({ where });
        if (!existing) throw error;
        if (existing.payloadHash !== payloadHash) throw new AppException('Idempotency-Key was already used with a different payload', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT);
        return existing.responseJson;
      }),
    );
  }

  private async persist(tenantId: string, userId: string, method: string, endpoint: string, idempotencyKey: string, payloadHash: string, result: unknown) {
    await this.prisma.restaurantInventoryIdempotencyRecord.create({ data: { tenantId, userId, method, endpoint, idempotencyKey, payloadHash, responseJson: JSON.parse(JSON.stringify(result)) } });
  }
}
