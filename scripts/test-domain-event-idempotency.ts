import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { SubscriptionAccessState } from '../src/common/auth/subscription-access-state.enum';
import { AccessScope } from '../src/common/enums/access-scope.enum';
import { RoleScope } from '../src/common/enums/role-scope.enum';
import { JwtPayload } from '../src/common/interfaces/jwt-payload.interface';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DOMAIN_EVENT_NAMES, DomainEventEnvelope, UnsignedDomainEventPayload } from '../src/domain-events/domain-event.constants';
import { DomainEventOutboxService } from '../src/domain-events/domain-event-outbox.service';

async function main() {
  process.env.MESSAGING_ENABLED = 'false';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const prisma = app.get(PrismaService);
    const outboxService = app.get(DomainEventOutboxService);

    const tenant = await prisma.tenant.findFirstOrThrow({
      orderBy: { createdAt: 'asc' },
    });
    const branch = await prisma.branch.findFirstOrThrow({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' },
    });
    const user = await prisma.user.findFirstOrThrow({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' },
    });
    const employee = await prisma.employee.findFirstOrThrow({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' },
    });

    const actor: JwtPayload = {
      sub: user.id,
      userId: user.id,
      sessionId: undefined,
      tenantId: tenant.id,
      allowedTenantIds: [tenant.id],
      activeTenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: 'TENANT_ADMIN',
      scope: AccessScope.TENANT,
      isSuperAdmin: false,
      roleScope: RoleScope.TENANT_ADMIN,
      allowedBranchIds: [branch.id],
      activeBranchId: branch.id,
      roles: ['TENANT_ADMIN'],
      permissions: ['domain_events.create'],
      enabledModules: [],
      isGlobalContext: false,
      impersonation: {
        active: false,
        tenantId: null,
        startedAt: null,
        reason: null,
      },
      subscriptionStatus: SubscriptionAccessState.ACTIVE,
      subscriptionGraceEndsAt: null,
    };

    const occurredAt = new Date('2026-07-23T00:00:00.000Z');
    const envelope: DomainEventEnvelope<UnsignedDomainEventPayload> = {
      eventName: DOMAIN_EVENT_NAMES.TRAINING_COMPLETED,
      eventVersion: 1,
      occurredAt,
      tenantId: tenant.id,
      branchId: branch.id,
      correlationId: 'phase6-idempotency-correlation',
      causationId: null,
      idempotencyKey: `phase6:idempotency:${tenant.id}:${employee.id}`,
      payload: {
        actor,
        dto: {
          branchId: branch.id,
          employeeId: employee.id,
          occurredAt,
          payload: { source: 'phase6-idempotency-script' },
        },
      },
    };

    const first = await outboxService.publish({
      envelope,
      userId: user.id,
      aggregateId: employee.id,
    });

    let duplicateBlocked = false;

    try {
      await outboxService.publish({
        envelope,
        userId: user.id,
        aggregateId: employee.id,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        duplicateBlocked = true;
      } else {
        throw error;
      }
    }

    if (!duplicateBlocked) {
      throw new Error('El outbox permitió un evento duplicado con la misma idempotencyKey');
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          test: 'domain-event-idempotency',
          firstEventId: first.id,
          duplicateBlocked,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
