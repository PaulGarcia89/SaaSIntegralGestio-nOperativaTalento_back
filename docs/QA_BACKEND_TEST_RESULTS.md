# Resultados de pruebas QA del backend

Fecha: **2026-08-13**

## Estado general

**Resultado: FAIL — no apto todavía como gate de release.**

La aplicación compila, pero las suites automatizadas no están completamente verdes. No se modificó código durante esta auditoría.

| Ejecución | Resultado | Evidencia |
|---|---|---|
| `npm run build` | PASS | Prisma Client generado y Nest compilado |
| `npm run test:rbac` | FAIL | 24 PASS, 3 FAIL |
| `npm test -- --runInBand` | FAIL | 33/37 suites PASS; 116/117 tests PASS |
| E2E real | NOT RUN | Requiere PostgreSQL aislado cuyo nombre incluya `e2e`, `test` o `certification` |
| Carga k6 | NOT RUN | Requiere entorno controlado y autorización del target |
| Pruebas destructivas en producción | NOT RUN | Prohibidas por el alcance |

## Resultados funcionales ejecutados

| Área | Expected | Actual | Estado |
|---|---|---|---|
| Compilación TypeScript/Nest | Sin errores | Sin errores | PASS |
| Guard sin autenticación | 401 | 401 en suite HTTP | PASS |
| Permiso granular ausente | 403 | 403 | PASS |
| Tenant manipulado | 403/404 sin fuga | PASS en casos RBAC | PASS |
| Sucursal no asignada | 403/404 | PASS en casos RBAC existentes | PASS parcial |
| Módulo no contratado | 403 | 403 | PASS |
| Suscripción vencida | 403 | 403 | PASS |
| Evento de otro tenant | 403 | 403 | PASS |
| Bulk de postulaciones cruzado | rollback/404 | PASS | PASS |
| Vacante por ID + branch | filtro esperado | cambió forma del query frente al fixture | FAIL de regresión |
| Candidato fusionado | sólo identidades del mismo account/merge | implementación amplió OR; test desactualizado | FAIL de regresión |
| Contratación sin workflow | 400 | mock falla antes con TypeError | FAIL de prueba |
| Analítica ATS | métricas completas | mock incompleto en source costs | FAIL |
| Automatización | suite compila | dependencia nueva no inyectada | FAIL |
| Talent CRM | suite compila | dependencia nueva no inyectada | FAIL |
| Certificación de integraciones | suite compila | Prisma no inyectado | FAIL |

## Fases cubiertas

- Inventario: 560 rutas efectivas, incluidos aliases.
- Validación DTO: configuración global verificada; casos unitarios existentes ejecutados.
- RBAC/multi-tenant/branch: cobertura automatizada existente ejecutada y revisada.
- Estados: revisión estática de vacantes, postulaciones, ofertas, contratación, onboarding, inventario y capacitación.
- Autenticación: revisión de login, refresh rotation, reuse detection, logout y sesiones.
- Integridad/concurrencia: revisión de constraints Prisma y transacciones; no se ejecutaron carreras reales sin DB aislada.
- Upload: revisión y tests unitarios existentes de archivos ATS/SCORM.
- Errores: filtro global inspeccionado y suite HTTP ejecutada.

## Cobertura pendiente antes de certificar

1. Reparar el gate Jest/RBAC.
2. Provisionar PostgreSQL y Redis efímeros y ejecutar `npm run test:e2e:full`.
3. Ejecutar carreras controladas: contratar dos veces, asignar el mismo activo, consumir reset dos veces y duplicar idempotency key.
4. Ejecutar matriz completa de DTOs por endpoint mediante tests parametrizados.
5. Ejecutar k6 con dataset representativo y capturar promedio, p95, p99, errores y saturación.
6. Ejecutar escáner de dependencias y SAST en CI con salida archivada.

## Criterio de salida recomendado

- 100% de suites verdes.
- 0 BLOCKER/CRITICAL abiertos.
- HIGH con fix verificado o aceptación formal de riesgo.
- E2E tenant A/B y branch A1/A2 verde.
- p95 de lecturas críticas menor al SLO acordado y error rate menor a 1%.
