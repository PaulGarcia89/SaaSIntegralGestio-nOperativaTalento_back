import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SubscriptionAccessState } from '../src/common/auth/subscription-access-state.enum';
import { AccessScope } from '../src/common/enums/access-scope.enum';
import { RoleScope } from '../src/common/enums/role-scope.enum';
import { JwtPayload } from '../src/common/interfaces/jwt-payload.interface';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DOMAIN_EVENT_NAMES, DomainEventEnvelope, UnsignedDomainEventPayload } from '../src/domain-events/domain-event.constants';
import { DomainEventOutboxService } from '../src/domain-events/domain-event-outbox.service';
import { DomainEventRoutingService } from '../src/domain-events/domain-event-routing.service';
import { IntegrationEventTrackingService } from '../src/domain-events/integration-event-tracking.service';

async function main() {
  process.env.MESSAGING_ENABLED = 'false';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const prisma = app.get(PrismaService);
    const outboxService = app.get(DomainEventOutboxService);
    const routingService = app.get(DomainEventRoutingService);
    const trackingService = app.get(IntegrationEventTrackingService);

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

    const occurredAt = new Date('2026-07-23T00:10:00.000Z');
    const envelope: DomainEventEnvelope<UnsignedDomainEventPayload> = {
      eventName: DOMAIN_EVENT_NAMES.ONBOARDING_COMPLETED,
      eventVersion: 1,
      occurredAt,
      tenantId: tenant.id,
      branchId: branch.id,
      correlationId: 'phase6-retry-correlation',
      causationId: null,
      idempotencyKey: `phase6:retry:${tenant.id}:${employee.id}:${occurredAt.toISOString()}`,
      payload: {
        actor,
        dto: {
          branchId: branch.id,
          employeeId: employee.id,
          occurredAt,
          payload: { source: 'phase6-retry-script' },
        },
      },
    };

    const created = await outboxService.publish({
      envelope,
      userId: user.id,
      aggregateId: employee.id,
      maxAttempts: 2,
    });

    const queueName = routingService.resolveQueue(created.eventName as typeof DOMAIN_EVENT_NAMES[keyof typeof DOMAIN_EVENT_NAMES]);

    const firstAttemptEvent = await prisma.outboxEvent.update({
      where: { id: created.id },
      data: {
        retryCount: 1,
      },
    });

    const firstDispatch = await trackingService.createDispatchAttempt(
      firstAttemptEvent,
      queueName,
      created.eventName,
    );

    await trackingService.markProcessingFailed({
      event: firstAttemptEvent,
      dispatchId: firstDispatch.id,
      queueName,
      errorMessage: 'first simulated failure',
      nextRetryAt: new Date(Date.now() + 15_000),
    });

    const afterFirstFailure = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: created.id },
    });

    const secondAttemptEvent = await prisma.outboxEvent.update({
      where: { id: created.id },
      data: {
        retryCount: 2,
      },
    });

    const secondDispatch = await trackingService.createDispatchAttempt(
      secondAttemptEvent,
      queueName,
      created.eventName,
    );

    await trackingService.markProcessingFailed({
      event: secondAttemptEvent,
      dispatchId: secondDispatch.id,
      queueName,
      errorMessage: 'second simulated failure',
      nextRetryAt: new Date(Date.now() + 30_000),
    });

    const afterSecondFailure = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: created.id },
    });
    const deadLetter = await prisma.deadLetterEvent.findUnique({
      where: { outboxEventId: created.id },
    });

    if (afterFirstFailure.status !== 'FAILED') {
      throw new Error(`Se esperaba FAILED tras el primer intento y llegó ${afterFirstFailure.status}`);
    }

    if (afterSecondFailure.status !== 'DEAD_LETTER') {
      throw new Error(
        `Se esperaba DEAD_LETTER tras agotar reintentos y llegó ${afterSecondFailure.status}`,
      );
    }

    if (!deadLetter) {
      throw new Error('No se creó registro en dead-letter tras agotar reintentos');
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          test: 'domain-event-retry',
          queueName,
          firstStatus: afterFirstFailure.status,
          finalStatus: afterSecondFailure.status,
          deadLetterId: deadLetter.id,
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
