# Hallazgos de seguridad y calidad

Fecha de corte: **2026-08-13**  
Alcance: revisión estática del backend, compilación, suites Jest/RBAC y revisión de la suite E2E. No se realizaron ataques ni escrituras contra producción.

## Resumen

| ID | Severidad | Hallazgo | Estado |
|---|---|---|---|
| QA-001 | HIGH | No existe rate limiting global ni específico para autenticación y endpoints públicos sensibles | Confirmado |
| QA-002 | HIGH | Aislamiento por sucursal incompleto en Productividad | Confirmado |
| QA-003 | HIGH | La suite de regresión no está verde: 4 suites Jest y 3 casos RBAC fallan | Confirmado |
| QA-004 | MEDIUM | Reset de contraseña de candidato admite carrera de doble consumo | Confirmado por inspección |
| QA-005 | MEDIUM | Idempotencia de ingestión de productividad no maneja correctamente una carrera | Confirmado por inspección |
| QA-006 | MEDIUM | Upload documental de preboarding confía principalmente en MIME declarado | Confirmado |
| QA-007 | MEDIUM | SCORM permite ZIP por extensión y usa secretos de desarrollo como fallback | Confirmado |
| QA-008 | MEDIUM | Varias rutas sensibles dependen de autorización dentro del servicio y no de una política declarativa uniforme | Confirmado |
| QA-009 | LOW | Contrato de errores no distingue sistemáticamente 409/422 y puede degradar errores Prisma a 500 | Confirmado por inspección |
| QA-010 | LOW | Falta una medición automatizada de cobertura, p95/p99 y conteo de queries como gate regular | Confirmado |

## QA-001 — Ausencia de rate limiting

**Severidad:** HIGH  
**Evidencia:** `src/main.ts`, `package.json`, ausencia de `@nestjs/throttler` o middleware equivalente.

No existe protección 429 efectiva para:

- `POST /auth/login` y `/auth/refresh`;
- registro/login/reset del candidato;
- self-scheduling de entrevistas;
- links firmados públicos;
- webhook de comunicaciones;
- ingestión interna de productividad.

**Impacto:** fuerza bruta, credential stuffing, enumeración temporal, abuso de correo, agotamiento de bcrypt/CPU y DoS de endpoints con acceso a proveedores externos.

**Recomendación:** límites por IP, identidad y tenant; límites más estrictos en login/reset; ventanas distribuidas usando Redis; respuesta uniforme 429 con `Retry-After`; pruebas de bypass por `X-Forwarded-For` detrás del proxy confiable.

## QA-002 — BOLA por sucursal en Productividad

**Severidad:** HIGH  
**Evidencia:** `src/productivity/productivity.controller.ts` y `src/productivity/productivity.service.ts`.

El controlador usa tenant, módulo y permisos, pero no `BranchAccessGuard`. Los endpoints aceptan `branchId`, `cameraId` o datos de sucursal y el servicio valida pertenencia al tenant, no que la sucursal esté incluida en `actor.allowedBranchIds`. Un usuario limitado a A1 con `productivity.view/manage` puede intentar consultar o administrar datos de A2 dentro del mismo tenant.

**Casos afectados:** cámaras, zonas, overview, insights, alertas, reglas y creación de cámaras.

**Recomendación:** pasar `JwtPayload` al servicio, construir siempre `branchId in allowedBranchIds`, validar recursos por `id + tenantId + branchScope`, y agregar pruebas A1→A2 para lectura y escritura.

## QA-003 — Gate de regresión roto

**Severidad:** HIGH  
**Evidencia ejecutada:**

- `npm run build`: PASS.
- `npm run test:rbac`: **24 PASS / 3 FAIL**.
- `npm test -- --runInBand`: **33 suites PASS / 4 FAIL; 116 tests PASS / 1 FAIL**.

Fallos:

1. Prueba RBAC de vacantes espera una forma de filtro anterior.
2. Prueba del portal de candidato no contempla candidatos fusionados.
3. Prueba de contratación usa un mock incompleto ante el nuevo pipeline de etapas.
4. `ats-analytics.service.spec.ts` no simula `recruitmentSourceCost`.
5. `automation.service.spec.ts` no inyecta `EnterpriseIntegrationsService`.
6. `talent-crm.service.spec.ts` no inyecta `AtsCommunicationsService`.
7. `production-integration-certification.service.spec.ts` no inyecta Prisma.

**Impacto:** la rama no puede considerarse certificada; defectos nuevos pueden quedar ocultos entre falsos negativos.

**Recomendación:** reparar fixtures/mocks sin relajar aserciones de seguridad, ejecutar en CI y bloquear despliegue si cualquier suite falla.

## QA-004 — Carrera en reset de contraseña de candidato

**Severidad:** MEDIUM  
**Evidencia:** `CandidateAuthService.resetPassword()` consulta el token usado y luego lo consume en una transacción separada lógicamente mediante update por ID.

Dos requests concurrentes pueden leer `usedAt = null` antes de que una lo marque usado. Ambas podrían actualizar la contraseña; la última gana.

**Recomendación:** `updateMany` condicional por `id + usedAt:null + expiresAt` dentro de transacción serializable, comprobar `count === 1`, y revocar sesiones/tokens previos después del cambio.

## QA-005 — Carrera de idempotencia en productividad

**Severidad:** MEDIUM  
**Evidencia:** `ProductivityService.ingest()` ejecuta `findFirst` y después `create`. Existe constraint único, pero el `P2002` concurrente no se convierte en respuesta idempotente.

**Impacto:** dos eventos simultáneos con la misma clave pueden producir una respuesta 500 aunque la base evite el duplicado.

**Recomendación:** upsert o captura explícita de `P2002`, recuperar el evento persistido y devolver `{duplicate:true}`.

## QA-006 — Validación desigual de documentos de onboarding

**Severidad:** MEDIUM  
**Evidencia:** `CandidatePreboardingService.uploadDocument()` valida MIME y tamaño, mientras el almacenamiento ATS privado sí inspecciona magic bytes, PDF activo y DOCX comprimido.

**Impacto:** extensión/MIME falsificado o contenido activo puede alcanzar almacenamiento/cuarentena documental dependiendo del scanner configurado.

**Recomendación:** centralizar validación binaria, nombre seguro, magic bytes, ratio de compresión y política fail-closed del antivirus para todos los uploads.

## QA-007 — Riesgos SCORM

**Severidad:** MEDIUM  
**Evidencia:** `TrainingScormStorageService` acepta si el MIME es ZIP **o** el nombre termina en `.zip`; usa fallback `development-only-key` si no hay secretos.

Hay buenas defensas de path traversal, cantidad de archivos y tamaño expandido. Sin embargo, falta exigir magic bytes y fallar al arrancar en producción cuando el secreto no está configurado.

**Recomendación:** MIME + magic bytes obligatorios, límite de ratio por entrada, CSP estricta al servir HTML/JS SCORM, sandbox en iframe y configuración de secreto obligatoria en producción.

## QA-008 — Autorización no homogénea

**Severidad:** MEDIUM  
**Evidencia:** 37 rutas autenticadas no presentan permiso de método en el inventario; algunas heredan permiso de clase y otras dependen de validación interna. Dashboard carece de permiso granular declarado; varias métricas globales heredan `metrics.read`.

No se afirma que todas sean vulnerables, pero la política queda difícil de auditar y propensa a regresiones.

**Recomendación:** metadatos obligatorios por controlador (`Public`, `CandidateOnly`, `InternalKey`, o permiso), prueba arquitectónica que falle ante rutas sin clasificación y OpenAPI generado desde esos metadatos.

## QA-009 — Normalización parcial de errores

**Severidad:** LOW  
**Evidencia:** `GlobalExceptionFilter` oculta stack/SQL correctamente, pero excepciones Prisma no mapeadas terminan como 500 y gran parte de errores HTTP no especializados se convierte en `BAD_REQUEST`.

**Recomendación:** mapear `P2002→409`, FK/constraint→409/422, validación semántica→422 y mantener un catálogo estable de códigos.

## QA-010 — Performance no certificada

**Severidad:** LOW  
**Evidencia:** existe script k6 de ATS y logging de requests lentas, pero la auditoría local no contó queries ni obtuvo p95/p99 contra una base aislada representativa.

**Recomendación:** dataset de volumen conocido, OpenTelemetry/Prisma query metrics, umbrales CI y pruebas de carga separadas de producción.

## Controles positivos observados

- Validación global con whitelist, transformación y rechazo de campos extra.
- Errores 500 no exponen stack, SQL ni secretos al cliente.
- Refresh tokens rotados, hasheados y detección de reutilización.
- Constraints multi-tenant e idempotencia de outbox.
- Contratación en transacción serializable con retry de `P2034`.
- Archivos ATS con magic bytes, límites, nombres seguros, hashes y tokens firmados.
- Protección de ZIP slip y tamaño expandido en SCORM.
- CORS restrictivo en producción y cookies configurables.
- Suite E2E se niega a operar sobre una base cuyo nombre no sea explícitamente de prueba.
