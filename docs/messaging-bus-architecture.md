# Arquitectura de mensajería y bus de eventos

## Estado actual

La plataforma ya opera con un bus interno basado en `BullMQ + Redis`, usando `OutboxEvent` como fuente confiable de publicación y `DeadLetterEvent` como capa de resiliencia operativa.

El diseño actual prioriza:

- consistencia transaccional;
- aislamiento multi-tenant;
- seguridad en consumo;
- reintentos controlados;
- trazabilidad por `correlationId`;
- evolución gradual hacia procesos separados.

## Módulos

### `src/messaging`

Infraestructura de colas BullMQ.

- `QueueManagerService`: crea colas y workers.
- `MessageBusPort`: contrato agnóstico del bus.
- `MESSAGE_BUS`: token de inyección para desacoplar transporte.
- `RabbitMqMessageBusService`: adapter enterprise con exchanges, routing keys, retry y DLQ.
- soporta `REDIS_URL` o `REDIS_HOST` + `REDIS_PORT`.
- puede desactivarse con `MESSAGING_ENABLED=false`.

Drivers soportados por configuración:

- `MESSAGE_BUS_DRIVER=bullmq`
- `MESSAGE_BUS_DRIVER=rabbitmq`

Hoy ambos drivers quedan soportados a nivel de contrato.
`bullmq` sigue siendo la opción recomendada para el despliegue actual del monolito.
`rabbitmq` ya implementa:

- exchange principal
- retry exchange
- dead-letter exchange
- cola principal por dominio
- cola `.retry`
- cola `.dlq`
- `ack` en éxito
- `ack + republish` para retry controlado
- `ack + publish a DLQ` al agotar retries
- `nack(requeue=true)` si falla el propio manejo del broker

### `src/outbox`

Límite lógico de publicación persistente.

- `OutboxModule`
- `DomainEventOutboxService`
- `IntegrationEventTrackingService`
- `DomainEventRoutingService`
- `DomainEventSecurityService`

Responsabilidades:

- guardar eventos dentro de la transacción;
- firmar payloads;
- registrar `IntegrationEventLog`;
- enrutar hacia cola por dominio;
- validar integridad y versión del evento.

### `src/queue-workers`

Límite lógico de procesamiento asíncrono.

- `QueueWorkersModule`
- `OutboxDispatcherService`
- `DomainEventExecutionService`
- `DomainEventWorkersService`
- `EventHandlerRegistryService`

Responsabilidades:

- sacar eventos del outbox;
- ponerlos en cola;
- procesarlos con workers;
- registrar éxito, fallo, retry y dead-letter.

## Flujo actual

1. La API NestJS recibe un comando o evento de dominio.
2. Se persiste el cambio de negocio.
3. Se persiste `OutboxEvent`.
4. Se registra `IntegrationEventLog(PUBLISHED)`.
5. `OutboxDispatcherService` toma el evento pendiente.
6. El dispatcher crea `OutboxEventDispatch`.
7. El evento se publica en BullMQ.
8. Un worker consume el job.
9. El worker valida:
   - `tenantId`
   - `branchId`
   - `eventName`
   - `eventVersion`
   - `correlationId`
   - firma HMAC interna del payload
10. El worker reconstruye contexto seguro por tenant/branch.
11. Se ejecuta el handler.
12. Se registra auditoría y estado final.

### Con BullMQ

- el dispatcher publica jobs en Redis;
- los workers BullMQ ejecutan handlers;
- la base sigue siendo la fuente de verdad para retries y DLQ lógica.

### Con RabbitMQ

- el dispatcher publica al exchange `domain.events`;
- cada bounded context consume su queue;
- si el handler falla:
  - el adapter programa retry broker-level en `queue.retry`;
  - al agotarse retries, publica en `queue.dlq`;
  - si falla el propio publish de retry/DLQ, hace `nack(..., requeue=true)` del mensaje original.

## Seguridad

La asincronía no confía en el frontend.

- El producer confiable es backend.
- El job de cola se trata como no confiable.
- El worker contrasta el job con el `OutboxEvent` persistido.
- El payload se firma con `DOMAIN_EVENT_SIGNING_SECRET`.
- Si no existe esa variable, usa `JWT_ACCESS_SECRET` como fallback temporal.

## Colas actuales

- `automation-events`
- `workflow-events`
- `notifications`
- `documents`
- `training`

## Tablas operativas

- `OutboxEvent`
- `OutboxEventDispatch`
- `IntegrationEventLog`
- `DeadLetterEvent`
- `ConsumerCheckpoint`

## Métricas operativas

Endpoints disponibles:

- `GET /metrics/queue-overview`
- `GET /metrics/dead-letter`
- `GET /metrics/throughput-by-domain`
- `GET /metrics/queue-errors-by-tenant`

Con esto se puede construir el panel operativo de:

- eventos pendientes;
- jobs en retry;
- fallos por tenant;
- DLQ abierta;
- throughput por dominio;
- latencia end-to-end.

## Pruebas operativas

Scripts disponibles:

- `npm run test:domain-events:idempotency`
- `npm run test:domain-events:retry`

## Variables recomendadas

```env
MESSAGING_ENABLED=true
MESSAGE_BUS_DRIVER=bullmq
REDIS_URL=redis://127.0.0.1:6379
DOMAIN_EVENT_SIGNING_SECRET=change-this-secret
QUEUE_CONCURRENCY_AUTOMATION_EVENTS=3
QUEUE_CONCURRENCY_WORKFLOW_EVENTS=3
QUEUE_CONCURRENCY_NOTIFICATIONS=2
QUEUE_CONCURRENCY_DOCUMENTS=2
QUEUE_CONCURRENCY_TRAINING=2

# RabbitMQ skeleton
RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672
# o alternativamente
RABBITMQ_HOST=127.0.0.1
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_MAIN_EXCHANGE=domain.events
RABBITMQ_RETRY_EXCHANGE=domain.events.retry
RABBITMQ_DLX_EXCHANGE=domain.events.dlx
RABBITMQ_MAX_RETRIES=3
RABBITMQ_RETRY_DELAY_MS=15000
RABBITMQ_RETRY_BACKOFF_MS=5000
```

## Siguiente paso recomendado

No extraer microservicios todavía.

La evolución sugerida es:

1. mantener BullMQ + Redis si sigues en un solo despliegue;
2. activar RabbitMQ cuando separes workers o procesos;
3. medir throughput, retries y DLQ por dominio;
4. evaluar Kafka solo cuando existan múltiples consumidores, replay o analítica/event streaming real.
