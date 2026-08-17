# Resultados de pruebas RBAC y seguridad multi-tenant

Fecha: **2026-08-13**

## Resultado general

**FAIL — no apto como gate de seguridad.**

| Ejecución | Resultado | Detalle |
|---|---|---|
| `npm run test:rbac` | FAIL | 24 PASS, 3 FAIL |
| Auditoría estática de guards | PARTIAL PASS | Tenant, sesión, permiso y módulo son sólidos |
| Auditoría de branch scope | FAIL | Inventario y Productividad omiten alcance del actor |
| E2E multi-tenant real | NOT RUN | No existe base aislada autorizada para esta ejecución |
| Pruebas contra producción | NOT RUN | Fuera de alcance y potencialmente destructivas |

## Casos automatizados aprobados

1. Fixtures contienen roles y familias de recursos requeridos.
2. Administradores de sucursal se resuelven como branch scope.
3. Sin actor autenticado devuelve 401.
4. Permiso granular ausente devuelve 403.
5. Permiso presente permite la operación.
6. `tenantId` manual de tenant B es rechazado.
7. Tenant inexistente devuelve 404 sin fuga.
8. Sucursal no asignada o de otro tenant es bloqueada.
9. Módulo no contratado es bloqueado.
10. Flujo compuesto exige todos sus módulos.
11. Suscripción vencida se bloquea antes del controlador.
12. `/me/context` refresca permisos desde persistencia.
13. Token revocado o de tipo incorrecto no conserva autorización.
14. Job de tenant A no procesa evento persistido de tenant B.
15. Read/update/delete/export/file cross-tenant comparten frontera de denegación.
16. Setup de vacante se limita a sucursales asignadas.
17. Entrevista rechaza postulación fuera del branch scope.
18. Conversión no mueve postulación a otra sucursal.
19. Actualización de sucursal liga ID, tenant y asignación del actor.
20. Admin de tenant no puede otorgar permisos que no posee.
21. Preflight de postulación liga tenant y sucursal antes de escribir.
22. Empleado simple queda limitado por ownership.
23. Lectura de interviewer incluye asignación, tenant y sucursal.
24. Bulk de postulaciones hace rollback ante mezcla cross-tenant.

## Casos automatizados fallidos

| Caso | Resultado observado | Interpretación |
|---|---|---|
| Vacante por ID + sucursal | El test esperaba `branchId.in` en una ubicación distinta del query actual | Gate desactualizado; no certifica branch isolation hasta corregirse |
| Portal de candidato | El servicio incluye candidato directo o candidato fusionado; test esperaba sólo `accountId` directo | Cambio funcional potencialmente válido; falta fixture de merges cross-account |
| Contratar sin workflow | `TypeError` en `resolveTargetStage` por mock Prisma incompleto | La aserción de seguridad no llega a ejecutarse |

## Resultado de los ataques exigidos

| Prueba | Expected | Actual | Estado |
|---|---|---|---|
| IDOR con ID de tenant B | 403/404 sin datos | Frontera tenant aplicada | PASS automatizado |
| Horizontal tenant A → tenant B | Denegado | Denegado en casos cubiertos | PASS parcial |
| Horizontal branch A1 → A2 | Denegado | Permitido en Inventario/Productividad con permiso válido | FAIL HIGH |
| Vertical sin permiso | 403 | 403 | PASS automatizado |
| Otorgar permiso superior | 403 | Bloqueado por ownership de permiso | PASS automatizado |
| Cambiar path ID | 403/404 | PASS en familias cubiertas | PASS parcial |
| Cambiar header `x-tenant-id` | 403 | 403 | PASS automatizado |
| Cambiar header/query `branchId` | 403/404 | FAIL en Inventario/Productividad | FAIL HIGH |
| Exportar tenant B | 403/404 | Filtro tenant presente | PASS estático/test genérico |
| Exportar branch A2 | 403/404 | Inventario permite `branchId` A2 dentro del tenant | FAIL HIGH |
| Archivo ATS ajeno | 403/404 antes de emitir enlace | Filtros tenant/branch/owner presentes | PASS estático |
| Reusar URL firmada filtrada | Válida sólo hasta TTL | Token bearer reutilizable durante TTL | PASS con riesgo LOW |
| Evidencia de inventario branch A2 | 403/404 | Consulta sólo por tenant + evidence ID | FAIL HIGH |
| Permiso revocado con access token antiguo | 403 | Contexto se reconstruye desde DB | PASS automatizado |
| Sesión revocada con JWT antiguo | 401 | Sesión se consulta por request | PASS estático/automatizado |
| Módulo retirado/no contratado | 403 | 403 | PASS automatizado |
| Suscripción bloqueada | 403 | 403 | PASS automatizado |

## Limitaciones de evidencia

- No se ejecutó una matriz HTTP real contra PostgreSQL con tenants A/B porque no se proporcionó una base efímera cuyo nombre indique `e2e`, `test` o `certification`.
- Los FAIL de Inventario/Productividad son hallazgos confirmados por flujo de código, no explotaciones ejecutadas contra producción.
- No se probaron URLs firmadas con reloj manipulado, rotación de secretos ni logs de proxy.
- No se considera PASS global hasta recorrer las 560 rutas del inventario con actores parametrizados.

## Criterio de salida

1. Corregir RBAC-001 y RBAC-002.
2. Obtener 27/27 en la suite RBAC o reemplazar los casos obsoletos por equivalentes más fuertes.
3. Ejecutar E2E con al menos tenant A/B, branches A1/A2/B1/B2 y los nueve perfiles de la matriz.
4. Exigir para cada ruta negativa: 401 sin sesión, 403 sin permiso/módulo, 403 o 404 cross-scope y cero efectos laterales.
5. Confirmar que exportaciones y archivos producen la misma frontera que la lectura JSON equivalente.
6. Bloquear release ante cualquier CRITICAL cross-tenant o HIGH de escalamiento sin mitigación verificada.

