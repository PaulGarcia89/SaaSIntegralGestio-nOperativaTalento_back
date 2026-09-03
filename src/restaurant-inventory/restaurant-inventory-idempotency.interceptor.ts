import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import { createHash } from 'crypto';
import { firstValueFrom, from, Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
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
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const key = request.header('Idempotency-Key')?.trim() || request.header('x-request-id')?.trim() || request.requestId?.trim();
    const userId = request.user?.sub;
    const tenantId = request.tenant?.id;
    const method = request.method.toUpperCase();
    if (!key || !userId || !tenantId || ['GET', 'HEAD', 'OPTIONS'].includes(method)) return next.handle();

    const endpoint = request.route?.path ?? request.path;
    const body = { query: request.query, params: request.params, body: request.body, file: request.file ? { name: request.file.originalname, size: request.file.size, hash: createHash('sha256').update(request.file.buffer ?? Buffer.alloc(0)).digest('hex') } : null };
    const payloadHash = createHash('sha256').update(JSON.stringify(stable(body))).digest('hex');
    const where = { tenantId_userId_method_endpoint_idempotencyKey: { tenantId, userId, method, endpoint, idempotencyKey: key } };
    const lockKey = `${tenantId}:${userId}:${method}:${endpoint}:${key}`;
    const running = this.inFlight.get(lockKey);
    if (running) return from(running);
    const execution = this.execute(next, where, lockKey, tenantId, userId, method, endpoint, key, payloadHash);
    this.inFlight.set(lockKey, execution);
    return from(execution).pipe(finalize(() => this.inFlight.delete(lockKey)));
  }

  private async execute(next: CallHandler, where: any, lockKey: string, tenantId: string, userId: string, method: string, endpoint: string, key: string, payloadHash: string) {
    try {
      const executeWith = async (db: any) => {
        const existing: any = await db.restaurantInventoryIdempotencyRecord.findUnique({ where });
        if (existing) {
          if (existing.payloadHash !== payloadHash) throw new AppException('Idempotency-Key was already used with a different payload', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT);
          return existing.responseJson;
        }
        const result = await firstValueFrom(next.handle());
        await this.persist(db, tenantId, userId, method, endpoint, key, payloadHash, result);
        return result;
      };
      if (typeof (this.prisma as any).$transaction === 'function') {
        return this.prisma.$transaction(async (tx: any) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
          return executeWith(tx);
        });
      }
      return executeWith(this.prisma);
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const existing: any = await this.prisma.restaurantInventoryIdempotencyRecord.findUnique({ where });
      if (!existing) throw error;
      if (existing.payloadHash !== payloadHash) throw new AppException('Idempotency-Key was already used with a different payload', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT);
      return existing.responseJson;
    }
  }

  private async persist(db: any, tenantId: string, userId: string, method: string, endpoint: string, idempotencyKey: string, payloadHash: string, result: unknown) {
    await db.restaurantInventoryIdempotencyRecord.create({ data: { tenantId, userId, method, endpoint, idempotencyKey, payloadHash, responseJson: JSON.parse(JSON.stringify(result)) } });
  }
}
