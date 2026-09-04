# Guard global de autenticación — procedimiento de activación

Origen: auditoría de arquitectura del 2026-09-04, hallazgo **CRÍTICO-4** (*la autenticación es opt-in por controlador*).

## Situación actual

`GlobalJwtAuthGuard` está registrado como `APP_GUARD` en `app.module.ts` pero **desactivado**: mientras `GLOBAL_AUTH_GUARD_ENABLED` no valga `true`, devuelve `true` sin hacer nada y el comportamiento del sistema es idéntico al de antes. Cada controlador sigue declarando sus propios guards.

Lo que sí está ya en su sitio:

- El decorador `@Public()` (`src/common/decorators/public.decorator.ts`), sobre la constante `AUTH_PUBLIC_KEY` que ya existía sin uso.
- Las **15 clases de controlador** sin autenticación marcadas con `@Public()`.
- `src/common/guards/global-jwt-auth.guard.spec.ts`, que recorre el árbol de controladores y **falla si aparece uno nuevo** sin guards y sin `@Public()`, o si la lista de públicos deja de coincidir con la lista revisada.

## Corrección respecto al informe de auditoría

El informe contaba **9 archivos** de controlador sin `JwtAuthGuard`. El recuento correcto, a nivel de **clase**, es **15**: varios archivos declaran más de un controlador, y las clases públicas conviven con clases autenticadas en el mismo archivo.

| Clase | Cómo se protege realmente |
|---|---|
| `HealthController` | Sondas de salud; no expone datos de negocio |
| `OpenApiController` | Documento OpenAPI — **pendiente de autenticar o retirar** |
| `AtsFileAccessController` | Token HMAC firmado, caducidad de 30–900 s |
| `PublicVacanciesController` | Portal público de vacantes; datos ya públicos |
| `PublicApplicationsController` | Postulación pública + `CandidateAuthGuard` por ruta |
| `CandidateAuthController` | Login y registro de candidato, con limitación de tasa |
| `ApplicantAuthController` | Login y registro de postulante, con limitación de tasa |
| `CandidateApplicationsController` | `CandidateAuthGuard` a nivel de clase |
| `InterviewSelfSchedulingController` | Enlace de autoagenda con token propio |
| `PublicSignaturesController` | Token de firma de un solo uso |
| `DocuSealWebhookController` | Firma HMAC-SHA256 del proveedor |
| `CommunicationWebhooksController` | Webhook de correo con secreto de proveedor |
| `PublicTrainingCertificateController` | Verificación pública de certificado por código |
| `PublicTrainingScormController` | URL de lanzamiento SCORM firmada |
| `ProductivityInternalController` | Clave de servicio en `x-productivity-service-key` |

## Antes de activar

1. **Cobertura en verde.** Las suites de los siete guards deben pasar (`npm test`). Ya lo están: `common/guards` al 99 % de sentencias y 97 % de ramas.
2. **Revisar las 15 rutas públicas** de la tabla anterior. Dos merecen decisión propia:
   - `OpenApiController` publica la superficie completa de la API sin autenticación. Autenticarlo o retirarlo del despliegue productivo.
   - `ProductivityInternalController` se apoya en una clave estática única para todos los tenants, comparada con `!==`. Debería pasar a clave por tenant y comparación *timing-safe*.
3. **Ejecutar la batería completa**: `npm run test:e2e:full`, `npm run test:rbac` y el flujo del portal público de candidatos.

## Activación

```bash
# 1. Preproducción, un ciclo completo con tráfico real
GLOBAL_AUTH_GUARD_ENABLED=true

# 2. Vigilar durante 24-48 h los 401 inesperados
#    (el logger de peticiones ya registra estado y ruta)
grep '"statusCode":401' <logs>

# 3. Producción, en ventana de baja actividad y con reversión preparada
```

La reversión es inmediata: poner la variable a `false` y reiniciar. No hay migración de datos ni cambio de contrato.

## Después de activar

Cuando el guard global lleve un ciclo estable en producción, los `@UseGuards(JwtAuthGuard, ...)` de cada controlador quedan redundantes en su primer elemento. **No retirarlos todavía**: la defensa en profundidad no molesta y su eliminación sería un cambio grande y arriesgado a cambio de nada.
