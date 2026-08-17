# Matriz de API del backend

> Inventario estático generado el 2026-08-13. Se detectaron **560 rutas efectivas**, incluyendo aliases de controladores. El prefijo global normal es `/api`.

## Resumen por módulo

| Módulo | Rutas |
|---|---:|
| `applications` | 68 |
| `ats-communications` | 20 |
| `audit-logs` | 2 |
| `auth` | 11 |
| `automation` | 16 |
| `billing` | 3 |
| `branches` | 10 |
| `common` | 1 |
| `companies` | 12 |
| `dashboard` | 1 |
| `domain-events` | 8 |
| `employees` | 8 |
| `enterprise-integrations` | 1 |
| `feature-flags` | 4 |
| `health` | 2 |
| `inventory` | 24 |
| `job-offers` | 13 |
| `metrics` | 18 |
| `modules` | 10 |
| `notifications` | 10 |
| `onboarding` | 36 |
| `permissions` | 2 |
| `plans` | 10 |
| `platform` | 1 |
| `recruitment` | 56 |
| `reports` | 10 |
| `roles` | 10 |
| `signatures` | 9 |
| `subscriptions` | 10 |
| `tenants` | 10 |
| `training` | 109 |
| `users` | 11 |
| `vacancies` | 18 |
| `workflow-master` | 2 |
| `workflows` | 24 |

## Convenciones

- **Auth `JWT/candidato`**: exige JWT de usuario interno o identidad formal de candidato, según controlador.
- **Público/interno**: no usa JWT en el controlador; puede usar token firmado, secreto de webhook o clave de servicio validada en el servicio.
- **Tenant Scope** refleja metadatos/guards declarativos observados. `PUBLIC` no significa ausencia de validación interna.
- **Branch Scope = No explícito** requiere verificar el filtro del servicio; no equivale automáticamente a vulnerabilidad.
- **Estado = Implementado** significa que existe ruta y handler; no certifica que todas sus variantes funcionales hayan pasado.

## Inventario completo

| Endpoint | Método | Módulo | Auth | Permiso | Tenant Scope | Branch Scope | Módulo contratado | Estado | Evidencia |
|---|---|---|---|---|---|---|---|---|---|
| `/applications` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:32` |
| `/applications/:id` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:175` |
| `/applications/:id/files/resume` | GET | `applications` | JWT/candidato | `applications.files.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:104` |
| `/applications/:id/files/resume/:fileId` | DELETE | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:145` |
| `/applications/:id/files/resume/versions` | GET | `applications` | JWT/candidato | `applications.files.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:114` |
| `/applications/:id/status` | PATCH | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:193` |
| `/applications/:id/transitions/:requestId/approve` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:204` |
| `/applications/:id/transitions/:requestId/reject` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:216` |
| `/applications/branch` | GET | `applications` | JWT/candidato | `applications.read` | BRANCH | Sí | `ATS` | Implementado | `src/applications/applications.controller.ts:163` |
| `/applications/branch/:id` | GET | `applications` | JWT/candidato | `applications.read` | BRANCH | Sí | `ATS` | Implementado | `src/applications/applications.controller.ts:181` |
| `/applications/branch/:id/status` | PATCH | `applications` | JWT/candidato | `applications.update` | BRANCH | Sí | `ATS` | Implementado | `src/applications/applications.controller.ts:228` |
| `/applications/bulk/status` | PATCH | `applications` | JWT/candidato | `applications.bulk_update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:52` |
| `/applications/export` | GET | `applications` | JWT/candidato | `applications.export` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:42` |
| `/applications/referrals` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:68` |
| `/applications/referrals` | POST | `applications` | JWT/candidato | `applications.create` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:71` |
| `/applications/rejection-reasons/list` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:92` |
| `/applications/saved-views` | POST | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:74` |
| `/applications/saved-views/:id` | DELETE | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:86` |
| `/applications/saved-views/:id` | PUT | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:80` |
| `/applications/saved-views/list` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:62` |
| `/applications/sla/process` | POST | `applications` | JWT/candidato | `applications.bulk_update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/applications.controller.ts:98` |
| `/candidate-auth/forgot-password` | POST | `applications` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-auth.controller.ts:26` |
| `/candidate-auth/login` | POST | `applications` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-auth.controller.ts:21` |
| `/candidate-auth/profile` | GET | `applications` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-auth.controller.ts:36` |
| `/candidate-auth/profile` | PATCH | `applications` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-auth.controller.ts:42` |
| `/candidate-auth/register` | POST | `applications` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-auth.controller.ts:16` |
| `/candidate-auth/reset-password` | POST | `applications` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-auth.controller.ts:31` |
| `/candidate-auth/social/:provider/callback` | GET | `applications` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-auth.controller.ts:53` |
| `/candidate-auth/social/:provider/start` | GET | `applications` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-auth.controller.ts:48` |
| `/candidate-auth/social/exchange` | POST | `applications` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-auth.controller.ts:63` |
| `/candidate/applications` | GET | `applications` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-applications.controller.ts:15` |
| `/candidate/applications/:id/withdraw` | POST | `applications` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-applications.controller.ts:25` |
| `/candidate/applications/interviews/:id/invitation.ics` | GET | `applications` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-applications.controller.ts:55` |
| `/candidate/applications/portal` | GET | `applications` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-applications.controller.ts:20` |
| `/candidate/applications/privacy-requests` | POST | `applications` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-applications.controller.ts:34` |
| `/candidate/applications/privacy-requests/:id/cancel` | POST | `applications` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-applications.controller.ts:39` |
| `/candidate/applications/resume/:id/access` | GET | `applications` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-applications.controller.ts:50` |
| `/candidate/applications/resume/parse` | POST | `applications` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/applications/candidate-applications.controller.ts:44` |
| `/talent-crm/campaigns` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:156` |
| `/talent-crm/campaigns` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:162` |
| `/talent-crm/campaigns/:id/approvals` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:192` |
| `/talent-crm/campaigns/:id/audience` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:180` |
| `/talent-crm/campaigns/:id/audience/prepare` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:174` |
| `/talent-crm/campaigns/:id/audience/review` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:186` |
| `/talent-crm/campaigns/:id/launch` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:168` |
| `/talent-crm/campaigns/:id/metrics` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:196` |
| `/talent-crm/candidates` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:42` |
| `/talent-crm/candidates/:id` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:48` |
| `/talent-crm/candidates/:id` | PATCH | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:54` |
| `/talent-crm/candidates/:id/activities` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:60` |
| `/talent-crm/candidates/:id/tags` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:66` |
| `/talent-crm/candidates/:id/tags/:tagId` | DELETE | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:72` |
| `/talent-crm/duplicates` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:120` |
| `/talent-crm/duplicates/merge` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:126` |
| `/talent-crm/pools` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:78` |
| `/talent-crm/pools` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:84` |
| `/talent-crm/pools/:id` | PATCH | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:90` |
| `/talent-crm/pools/:id/members` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:96` |
| `/talent-crm/pools/:id/members/:candidateId` | DELETE | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:102` |
| `/talent-crm/rediscovery` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:150` |
| `/talent-crm/segments` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:132` |
| `/talent-crm/segments` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:138` |
| `/talent-crm/segments/:id/preview` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:144` |
| `/talent-crm/sequences` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:202` |
| `/talent-crm/sequences` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:208` |
| `/talent-crm/sequences/:id/enroll` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:214` |
| `/talent-crm/tags` | GET | `applications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:108` |
| `/talent-crm/tags` | POST | `applications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/applications/talent-crm.controller.ts:114` |
| `/ats/communications/applications/:applicationId/history` | GET | `ats-communications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:126` |
| `/ats/communications/applications/:applicationId/messages` | POST | `ats-communications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:78` |
| `/ats/communications/applications/:applicationId/offer` | POST | `ats-communications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:140` |
| `/ats/communications/attachments/:id/access` | GET | `ats-communications` | JWT/candidato | `applications.files.read` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:94` |
| `/ats/communications/conversations` | GET | `ats-communications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:62` |
| `/ats/communications/conversations/:id` | GET | `ats-communications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:66` |
| `/ats/communications/conversations/:id` | PATCH | `ats-communications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:70` |
| `/ats/communications/conversations/:id/read` | POST | `ats-communications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:74` |
| `/ats/communications/domain` | GET | `ats-communications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:46` |
| `/ats/communications/domain` | PUT | `ats-communications` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:50` |
| `/ats/communications/domain/verify` | POST | `ats-communications` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:54` |
| `/ats/communications/inbox` | GET | `ats-communications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:58` |
| `/ats/communications/messages/:id/reply` | POST | `ats-communications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:98` |
| `/ats/communications/messages/:id/retry` | POST | `ats-communications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:156` |
| `/ats/communications/templates` | GET | `ats-communications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:102` |
| `/ats/communications/templates` | POST | `ats-communications` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:116` |
| `/ats/communications/unmatched` | GET | `ats-communications` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:82` |
| `/ats/communications/unmatched/:id/ignore` | POST | `ats-communications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:90` |
| `/ats/communications/unmatched/:id/link` | POST | `ats-communications` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/ats-communications/ats-communications.controller.ts:86` |
| `/webhooks/communications/resend` | POST | `ats-communications` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/ats-communications/ats-communications.controller.ts:171` |
| `/audit/logs` | GET | `audit-logs` | JWT/candidato | `audit.read` | TENANT | No explícito | — | Implementado | `src/audit-logs/audit-logs.controller.ts:18` |
| `/company/audit-logs` | GET | `audit-logs` | JWT/candidato | `audit.read` | TENANT | No explícito | — | Implementado | `src/audit-logs/audit-logs.controller.ts:18` |
| `/auth/context/branch` | PUT | `auth` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/auth/auth.controller.ts:65` |
| `/auth/context/tenant` | PUT | `auth` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/auth/auth.controller.ts:72` |
| `/auth/impersonation/start` | POST | `auth` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/auth/auth.controller.ts:79` |
| `/auth/impersonation/stop` | POST | `auth` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/auth/auth.controller.ts:86` |
| `/auth/login` | POST | `auth` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/auth/auth.controller.ts:21` |
| `/auth/logout` | POST | `auth` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/auth/auth.controller.ts:100` |
| `/auth/me` | GET | `auth` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/auth/auth.controller.ts:58` |
| `/auth/refresh` | POST | `auth` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/auth/auth.controller.ts:37` |
| `/auth/sessions` | GET | `auth` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/auth/auth.controller.ts:93` |
| `/auth/sessions/:sessionId` | DELETE | `auth` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/auth/auth.controller.ts:109` |
| `/me/context` | GET | `auth` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/auth/me.controller.ts:11` |
| `/automation/audit` | GET | `automation` | JWT/candidato | `automation.audit.read` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:124` |
| `/automation/catalog` | GET | `automation` | JWT/candidato | `automation.read` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:22` |
| `/automation/executions` | GET | `automation` | JWT/candidato | `automation.read` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:100` |
| `/automation/executions/:id` | GET | `automation` | JWT/candidato | `automation.read` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:106` |
| `/automation/executions/:id/retry` | POST | `automation` | JWT/candidato | `automation.update` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:112` |
| `/automation/executions/bulk-retry` | POST | `automation` | JWT/candidato | `automation.update` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:118` |
| `/automation/operations/overview` | GET | `automation` | JWT/candidato | `automation.read` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:44` |
| `/automation/rules` | GET | `automation` | JWT/candidato | `automation.read` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:56` |
| `/automation/rules` | POST | `automation` | JWT/candidato | `automation.create` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:62` |
| `/automation/rules/:id` | DELETE | `automation` | JWT/candidato | `automation.update` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:94` |
| `/automation/rules/:id` | PATCH | `automation` | JWT/candidato | `automation.update` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:68` |
| `/automation/rules/:id/duplicate` | POST | `automation` | JWT/candidato | `automation.create` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:78` |
| `/automation/rules/:id/simulate` | POST | `automation` | JWT/candidato | `automation.read` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:84` |
| `/automation/rules/bulk` | POST | `automation` | JWT/candidato | `automation.update` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:50` |
| `/automation/templates` | GET | `automation` | JWT/candidato | `automation.read` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:28` |
| `/automation/templates/:key` | POST | `automation` | JWT/candidato | `automation.create` | TENANT | No explícito | — | Implementado | `src/automation/automation.controller.ts:34` |
| `/billing/customer` | PUT | `billing` | JWT/candidato | `subscriptions.update` | TENANT | No explícito | — | Implementado | `src/billing/billing.controller.ts:27` |
| `/billing/invoices` | GET | `billing` | JWT/candidato | `subscriptions.read` | TENANT | No explícito | — | Implementado | `src/billing/billing.controller.ts:21` |
| `/billing/overview` | GET | `billing` | JWT/candidato | `subscriptions.read` | TENANT | No explícito | — | Implementado | `src/billing/billing.controller.ts:15` |
| `/branches` | GET | `branches` | JWT/candidato | `branches.read` | TENANT | No explícito | — | Implementado | `src/branches/branches.controller.ts:25` |
| `/branches` | POST | `branches` | JWT/candidato | `branches.create` | TENANT | No explícito | — | Implementado | `src/branches/branches.controller.ts:19` |
| `/branches/:id` | DELETE | `branches` | JWT/candidato | `branches.delete` | TENANT | No explícito | — | Implementado | `src/branches/branches.controller.ts:43` |
| `/branches/:id` | GET | `branches` | JWT/candidato | `branches.read` | TENANT | No explícito | — | Implementado | `src/branches/branches.controller.ts:31` |
| `/branches/:id` | PATCH | `branches` | JWT/candidato | `branches.update` | TENANT | No explícito | — | Implementado | `src/branches/branches.controller.ts:37` |
| `/company/branches` | GET | `branches` | JWT/candidato | `branches.read` | TENANT | No explícito | — | Implementado | `src/branches/branches.controller.ts:25` |
| `/company/branches` | POST | `branches` | JWT/candidato | `branches.create` | TENANT | No explícito | — | Implementado | `src/branches/branches.controller.ts:19` |
| `/company/branches/:id` | DELETE | `branches` | JWT/candidato | `branches.delete` | TENANT | No explícito | — | Implementado | `src/branches/branches.controller.ts:43` |
| `/company/branches/:id` | GET | `branches` | JWT/candidato | `branches.read` | TENANT | No explícito | — | Implementado | `src/branches/branches.controller.ts:31` |
| `/company/branches/:id` | PATCH | `branches` | JWT/candidato | `branches.update` | TENANT | No explícito | — | Implementado | `src/branches/branches.controller.ts:37` |
| `/public/ats-files/:kind/:id` | GET | `common` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/common/files/ats-file-access.controller.ts:7` |
| `/companies/current` | GET | `companies` | JWT/candidato | `tenants.read` | TENANT | No explícito | — | Implementado | `src/companies/companies.controller.ts:19` |
| `/companies/current` | PATCH | `companies` | JWT/candidato | `tenants.update` | TENANT | No explícito | — | Implementado | `src/companies/companies.controller.ts:31` |
| `/companies/current/capabilities` | GET | `companies` | JWT/candidato | `tenants.read` | TENANT | No explícito | — | Implementado | `src/companies/companies.controller.ts:25` |
| `/companies/settings` | GET | `companies` | JWT/candidato | `tenants.read` | TENANT | No explícito | — | Implementado | `src/companies/companies.controller.ts:19` |
| `/companies/settings` | PATCH | `companies` | JWT/candidato | `tenants.update` | TENANT | No explícito | — | Implementado | `src/companies/companies.controller.ts:31` |
| `/companies/settings/capabilities` | GET | `companies` | JWT/candidato | `tenants.read` | TENANT | No explícito | — | Implementado | `src/companies/companies.controller.ts:25` |
| `/company/current` | GET | `companies` | JWT/candidato | `tenants.read` | TENANT | No explícito | — | Implementado | `src/companies/companies.controller.ts:19` |
| `/company/current` | PATCH | `companies` | JWT/candidato | `tenants.update` | TENANT | No explícito | — | Implementado | `src/companies/companies.controller.ts:31` |
| `/company/current/capabilities` | GET | `companies` | JWT/candidato | `tenants.read` | TENANT | No explícito | — | Implementado | `src/companies/companies.controller.ts:25` |
| `/company/settings` | GET | `companies` | JWT/candidato | `tenants.read` | TENANT | No explícito | — | Implementado | `src/companies/companies.controller.ts:19` |
| `/company/settings` | PATCH | `companies` | JWT/candidato | `tenants.update` | TENANT | No explícito | — | Implementado | `src/companies/companies.controller.ts:31` |
| `/company/settings/capabilities` | GET | `companies` | JWT/candidato | `tenants.read` | TENANT | No explícito | — | Implementado | `src/companies/companies.controller.ts:25` |
| `/dashboard/operational` | GET | `dashboard` | JWT/candidato | — | TENANT | No explícito | — | Implementado | `src/dashboard/dashboard.controller.ts:12` |
| `/domain-events/asset-assigned` | POST | `domain-events` | JWT/candidato | `domain_events.asset_assigned` | TENANT | No explícito | `INVENTORY` | Implementado | `src/domain-events/domain-events.controller.ts:54` |
| `/domain-events/branch-changed` | POST | `domain-events` | JWT/candidato | `domain_events.branch_changed` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/domain-events/domain-events.controller.ts:27` |
| `/domain-events/candidate-hired` | POST | `domain-events` | JWT/candidato | `domain_events.candidate_hired` | TENANT | No explícito | `ATS` | Implementado | `src/domain-events/domain-events.controller.ts:18` |
| `/domain-events/compliance-closed` | POST | `domain-events` | JWT/candidato | `domain_events.compliance_closed` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/domain-events/domain-events.controller.ts:81` |
| `/domain-events/offboarding-started` | POST | `domain-events` | JWT/candidato | `domain_events.offboarding_started` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/domain-events/domain-events.controller.ts:36` |
| `/domain-events/onboarding-completed` | POST | `domain-events` | JWT/candidato | `domain_events.onboarding_completed` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/domain-events/domain-events.controller.ts:45` |
| `/domain-events/operation-handoff-completed` | POST | `domain-events` | JWT/candidato | `domain_events.operation_handoff_completed` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/domain-events/domain-events.controller.ts:72` |
| `/domain-events/training-completed` | POST | `domain-events` | JWT/candidato | `domain_events.training_completed` | TENANT | No explícito | `TRAINING` | Implementado | `src/domain-events/domain-events.controller.ts:63` |
| `/employees` | GET | `employees` | JWT/candidato | `employees.read` | BRANCH | Sí | — | Implementado | `src/employees/employees.controller.ts:30` |
| `/employees` | POST | `employees` | JWT/candidato | `employees.create` | BRANCH | Sí | — | Implementado | `src/employees/employees.controller.ts:24` |
| `/employees/:id` | GET | `employees` | JWT/candidato | `employees.read` | BRANCH | Sí | — | Implementado | `src/employees/employees.controller.ts:40` |
| `/employees/:id` | PATCH | `employees` | JWT/candidato | `employees.update` | BRANCH | Sí | — | Implementado | `src/employees/employees.controller.ts:46` |
| `/employees/:id/assignments` | POST | `employees` | JWT/candidato | `employees.update` | BRANCH | Sí | — | Implementado | `src/employees/employees.controller.ts:82` |
| `/employees/:id/history` | GET | `employees` | JWT/candidato | `employees.read` | BRANCH | Sí | — | Implementado | `src/employees/employees.controller.ts:66` |
| `/employees/:id/status` | PATCH | `employees` | JWT/candidato | `employees.update` | BRANCH | Sí | — | Implementado | `src/employees/employees.controller.ts:56` |
| `/employees/:id/transfer` | POST | `employees` | JWT/candidato | `employees.update` | BRANCH | Sí | — | Implementado | `src/employees/employees.controller.ts:72` |
| `/enterprise-integrations` | GET | `enterprise-integrations` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/enterprise-integrations/enterprise-integrations.controller.ts:12` |
| `/feature-flags` | GET | `feature-flags` | JWT/candidato | `modules.read` | TENANT | No explícito | — | Implementado | `src/feature-flags/feature-flags.controller.ts:19` |
| `/feature-flags/:moduleCode` | PUT | `feature-flags` | JWT/candidato | `modules.update` | TENANT | No explícito | — | Implementado | `src/feature-flags/feature-flags.controller.ts:48` |
| `/feature-flags/global` | GET | `feature-flags` | JWT/candidato | `modules.read` | GLOBAL | No explícito | — | Implementado | `src/feature-flags/feature-flags.controller.ts:25` |
| `/feature-flags/global/:tenantId/:moduleCode` | PUT | `feature-flags` | JWT/candidato | `modules.update` | GLOBAL | No explícito | — | Implementado | `src/feature-flags/feature-flags.controller.ts:32` |
| `/health` | GET | `health` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/health/health.controller.ts:15` |
| `/health/live` | GET | `health` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/health/health.controller.ts:6` |
| `/inventory/analytics` | GET | `inventory` | JWT/candidato | `inventory.read` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:33` |
| `/inventory/assets` | GET | `inventory` | JWT/candidato | `inventory.read` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:76` |
| `/inventory/assets` | POST | `inventory` | JWT/candidato | `inventory.manage` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:88` |
| `/inventory/assets/:id` | GET | `inventory` | JWT/candidato | `inventory.read` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:85` |
| `/inventory/assets/:id/assign` | POST | `inventory` | JWT/candidato | `inventory.manage` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:94` |
| `/inventory/assets/:id/deliver` | POST | `inventory` | JWT/candidato | `inventory.manage` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:100` |
| `/inventory/assets/:id/request-return` | POST | `inventory` | JWT/candidato | `inventory.manage` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:112` |
| `/inventory/assets/:id/return` | POST | `inventory` | JWT/candidato | `inventory.manage` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:118` |
| `/inventory/assets/:id/transfer` | POST | `inventory` | JWT/candidato | `inventory.manage` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:106` |
| `/inventory/assets/:id/validate-return` | PATCH | `inventory` | JWT/candidato | `inventory.manage` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:124` |
| `/inventory/assets/lookup/:assetTag` | GET | `inventory` | JWT/candidato | `inventory.read` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:82` |
| `/inventory/audit-trail` | GET | `inventory` | JWT/candidato | `inventory.manage` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:36` |
| `/inventory/catalog` | GET | `inventory` | JWT/candidato | `inventory.read` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:30` |
| `/inventory/catalog` | POST | `inventory` | JWT/candidato | `inventory.manage` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:70` |
| `/inventory/context` | GET | `inventory` | JWT/candidato | `inventory.read` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:27` |
| `/inventory/evidence/:id` | GET | `inventory` | JWT/candidato | `inventory.read` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:130` |
| `/inventory/locations` | GET | `inventory` | JWT/candidato | `inventory.read` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:39` |
| `/inventory/locations` | POST | `inventory` | JWT/candidato | `inventory.manage` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:42` |
| `/inventory/my-assets` | GET | `inventory` | JWT/candidato | `inventory.read` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:79` |
| `/inventory/suppliers` | GET | `inventory` | JWT/candidato | `inventory.read, inventory.manage, inventory.read, inventory.manage, inventory.manage, inventory.manage, inventory.read, inventory.manage, inventory.manage, inventory.read` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:57` |
| `/inventory/warehouse` | GET | `inventory` | JWT/candidato | `inventory.read` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:45` |
| `/inventory/warehouse/adjustments` | POST | `inventory` | JWT/candidato | `inventory.manage` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:48` |
| `/inventory/warehouse/counts` | POST | `inventory` | JWT/candidato | `inventory.manage` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:51` |
| `/inventory/warehouse/policy` | PATCH | `inventory` | JWT/candidato | `inventory.manage` | TENANT | No explícito | `INVENTORY` | Implementado | `src/inventory/inventory.controller.ts:54` |
| `/ats/offers/:id/approvals` | POST | `job-offers` | JWT/candidato | `applications.update` | TENANT | No explícito | — | Implementado | `src/job-offers/job-offers.controller.ts:54` |
| `/ats/offers/:id/cancel` | POST | `job-offers` | JWT/candidato | `applications.update` | TENANT | No explícito | — | Implementado | `src/job-offers/job-offers.controller.ts:72` |
| `/ats/offers/:id/pdf` | GET | `job-offers` | JWT/candidato | `applications.read` | TENANT | No explícito | — | Implementado | `src/job-offers/job-offers.controller.ts:78` |
| `/ats/offers/:id/retry-conversion` | POST | `job-offers` | JWT/candidato | `applications.update` | TENANT | No explícito | — | Implementado | `src/job-offers/job-offers.controller.ts:66` |
| `/ats/offers/:id/send` | POST | `job-offers` | JWT/candidato | `applications.update` | TENANT | No explícito | — | Implementado | `src/job-offers/job-offers.controller.ts:60` |
| `/ats/offers/:id/versions` | POST | `job-offers` | JWT/candidato | `applications.update` | TENANT | No explícito | — | Implementado | `src/job-offers/job-offers.controller.ts:48` |
| `/ats/offers/applications/:applicationId` | GET | `job-offers` | JWT/candidato | `applications.read` | TENANT | No explícito | — | Implementado | `src/job-offers/job-offers.controller.ts:36` |
| `/ats/offers/applications/:applicationId` | POST | `job-offers` | JWT/candidato | `applications.update` | TENANT | No explícito | — | Implementado | `src/job-offers/job-offers.controller.ts:42` |
| `/candidate/offers` | GET | `job-offers` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/job-offers/job-offers.controller.ts:93` |
| `/candidate/offers/:id/counter` | POST | `job-offers` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/job-offers/job-offers.controller.ts:114` |
| `/candidate/offers/:id/pdf` | GET | `job-offers` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/job-offers/job-offers.controller.ts:96` |
| `/candidate/offers/:id/respond` | POST | `job-offers` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/job-offers/job-offers.controller.ts:109` |
| `/candidate/offers/:id/signing-link` | POST | `job-offers` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/job-offers/job-offers.controller.ts:104` |
| `/metrics/active-branches` | GET | `metrics` | JWT/candidato | — | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:126` |
| `/metrics/active-tenants` | GET | `metrics` | JWT/candidato | — | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:80` |
| `/metrics/active-users-by-branch` | GET | `metrics` | JWT/candidato | — | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:138` |
| `/metrics/active-users-by-tenant` | GET | `metrics` | JWT/candidato | — | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:91` |
| `/metrics/ats-storage` | GET | `metrics` | JWT/candidato | `metrics.operations.read` | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:29` |
| `/metrics/ats-storage/maintenance` | POST | `metrics` | JWT/candidato | `metrics.operations.read` | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:45` |
| `/metrics/branch-request-activity` | GET | `metrics` | JWT/candidato | — | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:163` |
| `/metrics/dead-letter` | GET | `metrics` | JWT/candidato | `metrics.operations.read` | PUBLIC | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:188` |
| `/metrics/integration-certification` | GET | `metrics` | JWT/candidato | `metrics.operations.read` | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:53` |
| `/metrics/integration-certification/run` | POST | `metrics` | JWT/candidato | `metrics.operations.read` | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:61` |
| `/metrics/last-access-by-branch` | GET | `metrics` | JWT/candidato | — | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:151` |
| `/metrics/last-access-by-tenant` | GET | `metrics` | JWT/candidato | — | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:103` |
| `/metrics/login-activity` | GET | `metrics` | JWT/candidato | — | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:114` |
| `/metrics/queue-errors-by-tenant` | GET | `metrics` | JWT/candidato | `metrics.operations.read` | PUBLIC | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:212` |
| `/metrics/queue-overview` | GET | `metrics` | JWT/candidato | `metrics.operations.read` | PUBLIC | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:176` |
| `/metrics/runtime-usage` | GET | `metrics` | JWT/candidato | `metrics.operations.read` | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:37` |
| `/metrics/tenant-activity` | GET | `metrics` | JWT/candidato | — | GLOBAL | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:69` |
| `/metrics/throughput-by-domain` | GET | `metrics` | JWT/candidato | `metrics.operations.read` | PUBLIC | No explícito | — | Implementado | `src/metrics/metrics.controller.ts:200` |
| `/admin/modules` | GET | `modules` | JWT/candidato | `modules.read` | GLOBAL | No explícito | — | Implementado | `src/modules/platform-modules.controller.ts:25` |
| `/admin/modules` | POST | `modules` | JWT/candidato | `modules.create` | GLOBAL | No explícito | — | Implementado | `src/modules/platform-modules.controller.ts:19` |
| `/admin/modules/:id` | DELETE | `modules` | JWT/candidato | `modules.delete` | GLOBAL | No explícito | — | Implementado | `src/modules/platform-modules.controller.ts:43` |
| `/admin/modules/:id` | GET | `modules` | JWT/candidato | `modules.read` | GLOBAL | No explícito | — | Implementado | `src/modules/platform-modules.controller.ts:31` |
| `/admin/modules/:id` | PATCH | `modules` | JWT/candidato | `modules.update` | GLOBAL | No explícito | — | Implementado | `src/modules/platform-modules.controller.ts:37` |
| `/modules` | GET | `modules` | JWT/candidato | `modules.read` | GLOBAL | No explícito | — | Implementado | `src/modules/platform-modules.controller.ts:25` |
| `/modules` | POST | `modules` | JWT/candidato | `modules.create` | GLOBAL | No explícito | — | Implementado | `src/modules/platform-modules.controller.ts:19` |
| `/modules/:id` | DELETE | `modules` | JWT/candidato | `modules.delete` | GLOBAL | No explícito | — | Implementado | `src/modules/platform-modules.controller.ts:43` |
| `/modules/:id` | GET | `modules` | JWT/candidato | `modules.read` | GLOBAL | No explícito | — | Implementado | `src/modules/platform-modules.controller.ts:31` |
| `/modules/:id` | PATCH | `modules` | JWT/candidato | `modules.update` | GLOBAL | No explícito | — | Implementado | `src/modules/platform-modules.controller.ts:37` |
| `/notifications` | GET | `notifications` | JWT/candidato | `notifications.read_own` | TENANT | No explícito | — | Implementado | `src/notifications/notifications.controller.ts:18` |
| `/notifications` | POST | `notifications` | JWT/candidato | `notifications.send` | TENANT | No explícito | — | Implementado | `src/notifications/notifications.controller.ts:24` |
| `/notifications/:id` | DELETE | `notifications` | JWT/candidato | `notifications.update_own` | TENANT | No explícito | — | Implementado | `src/notifications/notifications.controller.ts:48` |
| `/notifications/:id/archive` | PATCH | `notifications` | JWT/candidato | `notifications.update_own` | TENANT | No explícito | — | Implementado | `src/notifications/notifications.controller.ts:42` |
| `/notifications/:id/read` | PATCH | `notifications` | JWT/candidato | `notifications.update_own` | TENANT | No explícito | — | Implementado | `src/notifications/notifications.controller.ts:30` |
| `/notifications/deliveries` | GET | `notifications` | JWT/candidato | `notifications.read_own` | TENANT | No explícito | — | Implementado | `src/notifications/notifications.controller.ts:69` |
| `/notifications/deliveries/:id/retry` | POST | `notifications` | JWT/candidato | `notifications.update_own` | TENANT | No explícito | — | Implementado | `src/notifications/notifications.controller.ts:78` |
| `/notifications/preferences/me` | GET | `notifications` | JWT/candidato | `notifications.read_own` | TENANT | No explícito | — | Implementado | `src/notifications/notifications.controller.ts:54` |
| `/notifications/preferences/me` | PATCH | `notifications` | JWT/candidato | `notifications.update_own` | TENANT | No explícito | — | Implementado | `src/notifications/notifications.controller.ts:60` |
| `/notifications/read-all` | PATCH | `notifications` | JWT/candidato | `notifications.update_own` | TENANT | No explícito | — | Implementado | `src/notifications/notifications.controller.ts:36` |
| `/candidate/preboarding` | GET | `onboarding` | JWT/candidato | — | PUBLIC | No explícito | — | Implementado | `src/onboarding/onboarding.controller.ts:293` |
| `/onboarding/analytics` | GET | `onboarding` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:28` |
| `/onboarding/compliance/retention-policies` | GET | `onboarding` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:93` |
| `/onboarding/compliance/retention-policies` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:97` |
| `/onboarding/compliance/retention-policies/:id/approve` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:104` |
| `/onboarding/compliance/signature-evidence` | GET | `onboarding` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:111` |
| `/onboarding/context` | GET | `onboarding` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:48` |
| `/onboarding/documents/:id` | DELETE | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:252` |
| `/onboarding/documents/:id/download` | GET | `onboarding` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:218` |
| `/onboarding/documents/:id/lifecycle` | PATCH | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:245` |
| `/onboarding/documents/:id/replace` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:236` |
| `/onboarding/documents/:id/review` | PATCH | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:229` |
| `/onboarding/flows` | GET | `onboarding` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:115` |
| `/onboarding/flows/:id` | GET | `onboarding` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:132` |
| `/onboarding/flows/:id/apply-template` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:158` |
| `/onboarding/flows/:id/complete` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:259` |
| `/onboarding/flows/:id/export` | GET | `onboarding` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:280` |
| `/onboarding/flows/:id/legal-holds` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:266` |
| `/onboarding/flows/:id/performance` | GET | `onboarding` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:138` |
| `/onboarding/flows/:id/performance/evaluations` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:151` |
| `/onboarding/flows/:id/performance/objectives` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:144` |
| `/onboarding/flows/:id/tasks` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:179` |
| `/onboarding/flows/:id/tasks/reorder` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:186` |
| `/onboarding/flows/bulk-apply-template` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:165` |
| `/onboarding/legal-holds/:id/release` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:273` |
| `/onboarding/library` | GET | `onboarding` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:82` |
| `/onboarding/library` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:86` |
| `/onboarding/operations/overview` | GET | `onboarding` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:34` |
| `/onboarding/operations/process-due` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:38` |
| `/onboarding/tasks/:id` | DELETE | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:193` |
| `/onboarding/tasks/:id` | PATCH | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:172` |
| `/onboarding/templates` | GET | `onboarding` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:42` |
| `/onboarding/templates` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:54` |
| `/onboarding/templates/:id` | PATCH | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:61` |
| `/onboarding/templates/:id/approve` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:75` |
| `/onboarding/templates/:id/revisions` | POST | `onboarding` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/onboarding/onboarding.controller.ts:68` |
| `/company/permissions` | GET | `permissions` | JWT/candidato | `permissions.read` | TENANT | No explícito | — | Implementado | `src/permissions/permissions.controller.ts:17` |
| `/permissions` | GET | `permissions` | JWT/candidato | `permissions.read` | TENANT | No explícito | — | Implementado | `src/permissions/permissions.controller.ts:17` |
| `/admin/plans` | GET | `plans` | JWT/candidato | `plans.read` | GLOBAL | No explícito | — | Implementado | `src/plans/plans.controller.ts:25` |
| `/admin/plans` | POST | `plans` | JWT/candidato | `plans.create` | GLOBAL | No explícito | — | Implementado | `src/plans/plans.controller.ts:19` |
| `/admin/plans/:id` | DELETE | `plans` | JWT/candidato | `plans.delete` | GLOBAL | No explícito | — | Implementado | `src/plans/plans.controller.ts:43` |
| `/admin/plans/:id` | GET | `plans` | JWT/candidato | `plans.read` | GLOBAL | No explícito | — | Implementado | `src/plans/plans.controller.ts:31` |
| `/admin/plans/:id` | PATCH | `plans` | JWT/candidato | `plans.update` | GLOBAL | No explícito | — | Implementado | `src/plans/plans.controller.ts:37` |
| `/plans` | GET | `plans` | JWT/candidato | `plans.read` | GLOBAL | No explícito | — | Implementado | `src/plans/plans.controller.ts:25` |
| `/plans` | POST | `plans` | JWT/candidato | `plans.create` | GLOBAL | No explícito | — | Implementado | `src/plans/plans.controller.ts:19` |
| `/plans/:id` | DELETE | `plans` | JWT/candidato | `plans.delete` | GLOBAL | No explícito | — | Implementado | `src/plans/plans.controller.ts:43` |
| `/plans/:id` | GET | `plans` | JWT/candidato | `plans.read` | GLOBAL | No explícito | — | Implementado | `src/plans/plans.controller.ts:31` |
| `/plans/:id` | PATCH | `plans` | JWT/candidato | `plans.update` | GLOBAL | No explícito | — | Implementado | `src/plans/plans.controller.ts:37` |
| `/openapi.json` | GET | `platform` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/platform/openapi.controller.ts:6` |
| `/public/interview-scheduling/:token` | GET | `recruitment` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/recruitment/interview-self-scheduling.controller.ts:7` |
| `/public/interview-scheduling/:token/book` | POST | `recruitment` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/recruitment/interview-self-scheduling.controller.ts:10` |
| `/recruitment/applications/:id/competency-ai-assessment` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:84` |
| `/recruitment/applications/:id/competency-ai-assessment` | POST | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:90` |
| `/recruitment/applications/:id/competency-ai-assessment/:assessmentId/sign` | POST | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:96` |
| `/recruitment/applications/:id/decision-committee` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:398` |
| `/recruitment/applications/:id/external-assessments` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:302` |
| `/recruitment/applications/:id/hiring-manager-approval` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:326` |
| `/recruitment/applications/:id/hiring-manager-approval` | PUT | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:320` |
| `/recruitment/applications/:id/hiring-manager-approval/decision` | POST | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:332` |
| `/recruitment/availability/settings` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:506` |
| `/recruitment/availability/settings` | PUT | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:515` |
| `/recruitment/calendar-connections` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:435` |
| `/recruitment/calendar-connections/:provider` | DELETE | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:484` |
| `/recruitment/calendar-connections/:provider/authorize` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:450` |
| `/recruitment/calendar-connections/:provider/oauth` | POST | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:467` |
| `/recruitment/calendar-providers` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:444` |
| `/recruitment/coordination-queue` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:206` |
| `/recruitment/decision-committees` | POST | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:388` |
| `/recruitment/decision-committees/:id/finalize` | POST | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:419` |
| `/recruitment/decision-committees/:id/vote` | POST | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:408` |
| `/recruitment/external-assessments` | POST | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:308` |
| `/recruitment/external-assessments/:id/result` | PATCH | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:314` |
| `/recruitment/interview-pools` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:164` |
| `/recruitment/interview-pools` | POST | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:170` |
| `/recruitment/interview-resources` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:176` |
| `/recruitment/interview-resources` | POST | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:182` |
| `/recruitment/interview-scheduling-requests` | POST | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:200` |
| `/recruitment/interview-sequences` | POST | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:158` |
| `/recruitment/interviewer-profiles` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:188` |
| `/recruitment/interviewer-profiles/:userId` | PUT | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:194` |
| `/recruitment/interviewers/:id/availability` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:495` |
| `/recruitment/interviews` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:138` |
| `/recruitment/interviews` | POST | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:148` |
| `/recruitment/interviews/:id` | PATCH | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:218` |
| `/recruitment/interviews/:id/calendar/retry` | POST | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:529` |
| `/recruitment/interviews/:id/invitation.ics` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:539` |
| `/recruitment/interviews/:id/participants/me` | PATCH | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:212` |
| `/recruitment/interviews/:id/scorecard` | PUT | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:229` |
| `/recruitment/interviews/:id/scorecard-assignments` | PUT | `recruitment` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:296` |
| `/recruitment/interviews/:id/scorecard-comparison` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:374` |
| `/recruitment/interviews/:id/scorecard-context` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:364` |
| `/recruitment/scorecard-bias-validations` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:352` |
| `/recruitment/scorecard-bias-validations` | POST | `recruitment` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:358` |
| `/recruitment/scorecard-calibration` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:338` |
| `/recruitment/scorecard-calibration/run` | POST | `recruitment` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:344` |
| `/recruitment/scorecard-competencies` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:278` |
| `/recruitment/scorecard-competencies` | POST | `recruitment` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:284` |
| `/recruitment/scorecard-competencies/:id` | PATCH | `recruitment` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:290` |
| `/recruitment/scorecard-templates` | GET | `recruitment` | JWT/candidato | `applications.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:240` |
| `/recruitment/scorecard-templates` | POST | `recruitment` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:256` |
| `/recruitment/scorecard-templates/:id` | PATCH | `recruitment` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:266` |
| `/recruitment/scorecard-templates/:id/duplicate` | POST | `recruitment` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:272` |
| `/recruitment/vacancies/:id/responsibles` | PUT | `recruitment` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:123` |
| `/recruitment/vacancies/:id/setup` | GET | `recruitment` | JWT/candidato | `vacancies.read` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:102` |
| `/recruitment/vacancies/:id/stages` | PUT | `recruitment` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/recruitment/recruitment.controller.ts:108` |
| `/reports/ats-analytics` | GET | `reports` | JWT/candidato | `applications.read` | TENANT | No explícito | — | Implementado | `src/reports/reports.controller.ts:33` |
| `/reports/ats-analytics/dashboards` | GET | `reports` | JWT/candidato | `applications.read` | TENANT | No explícito | — | Implementado | `src/reports/reports.controller.ts:45` |
| `/reports/ats-analytics/dashboards` | POST | `reports` | JWT/candidato | `applications.read` | TENANT | No explícito | — | Implementado | `src/reports/reports.controller.ts:49` |
| `/reports/ats-analytics/export` | GET | `reports` | JWT/candidato | `applications.export` | TENANT | No explícito | — | Implementado | `src/reports/reports.controller.ts:39` |
| `/reports/ats-analytics/hiring-quality` | GET | `reports` | JWT/candidato | `applications.read` | TENANT | No explícito | — | Implementado | `src/reports/reports.controller.ts:61` |
| `/reports/ats-analytics/hiring-quality` | POST | `reports` | JWT/candidato | `applications.update` | TENANT | No explícito | — | Implementado | `src/reports/reports.controller.ts:65` |
| `/reports/ats-analytics/source-costs` | GET | `reports` | JWT/candidato | `applications.read` | TENANT | No explícito | — | Implementado | `src/reports/reports.controller.ts:53` |
| `/reports/ats-analytics/source-costs` | POST | `reports` | JWT/candidato | `applications.update` | TENANT | No explícito | — | Implementado | `src/reports/reports.controller.ts:57` |
| `/reports/export` | GET | `reports` | JWT/candidato | `applications.export` | TENANT | No explícito | — | Implementado | `src/reports/reports.controller.ts:27` |
| `/reports/overview` | GET | `reports` | JWT/candidato | `metrics.read` | TENANT | No explícito | — | Implementado | `src/reports/reports.controller.ts:21` |
| `/company/roles` | GET | `roles` | JWT/candidato | `roles.read` | TENANT | No explícito | — | Implementado | `src/roles/roles.controller.ts:26` |
| `/company/roles` | POST | `roles` | JWT/candidato | `roles.create` | TENANT | No explícito | — | Implementado | `src/roles/roles.controller.ts:20` |
| `/company/roles/:id` | DELETE | `roles` | JWT/candidato | `roles.delete` | TENANT | No explícito | — | Implementado | `src/roles/roles.controller.ts:49` |
| `/company/roles/:id` | GET | `roles` | JWT/candidato | `roles.read` | TENANT | No explícito | — | Implementado | `src/roles/roles.controller.ts:32` |
| `/company/roles/:id` | PATCH | `roles` | JWT/candidato | `roles.update` | TENANT | No explícito | — | Implementado | `src/roles/roles.controller.ts:38` |
| `/roles` | GET | `roles` | JWT/candidato | `roles.read` | TENANT | No explícito | — | Implementado | `src/roles/roles.controller.ts:26` |
| `/roles` | POST | `roles` | JWT/candidato | `roles.create` | TENANT | No explícito | — | Implementado | `src/roles/roles.controller.ts:20` |
| `/roles/:id` | DELETE | `roles` | JWT/candidato | `roles.delete` | TENANT | No explícito | — | Implementado | `src/roles/roles.controller.ts:49` |
| `/roles/:id` | GET | `roles` | JWT/candidato | `roles.read` | TENANT | No explícito | — | Implementado | `src/roles/roles.controller.ts:32` |
| `/roles/:id` | PATCH | `roles` | JWT/candidato | `roles.update` | TENANT | No explícito | — | Implementado | `src/roles/roles.controller.ts:38` |
| `/public/signatures/:token` | GET | `signatures` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/signatures/signatures.controller.ts:58` |
| `/public/signatures/:token/consent` | POST | `signatures` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/signatures/signatures.controller.ts:61` |
| `/signatures/packages` | GET | `signatures` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/signatures/signatures.controller.ts:32` |
| `/signatures/packages` | POST | `signatures` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/signatures/signatures.controller.ts:35` |
| `/signatures/packages/:id/remind` | POST | `signatures` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/signatures/signatures.controller.ts:47` |
| `/signatures/packages/:id/send` | POST | `signatures` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/signatures/signatures.controller.ts:41` |
| `/signatures/providers` | GET | `signatures` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/signatures/signatures.controller.ts:20` |
| `/signatures/templates` | GET | `signatures` | JWT/candidato | `applications.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/signatures/signatures.controller.ts:23` |
| `/signatures/templates` | POST | `signatures` | JWT/candidato | `applications.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/signatures/signatures.controller.ts:26` |
| `/admin/subscriptions` | GET | `subscriptions` | JWT/candidato | `subscriptions.read` | GLOBAL | No explícito | — | Implementado | `src/subscriptions/subscriptions.controller.ts:26` |
| `/admin/subscriptions` | POST | `subscriptions` | JWT/candidato | `subscriptions.create` | GLOBAL | No explícito | — | Implementado | `src/subscriptions/subscriptions.controller.ts:20` |
| `/admin/subscriptions/:id` | DELETE | `subscriptions` | JWT/candidato | `subscriptions.delete` | GLOBAL | No explícito | — | Implementado | `src/subscriptions/subscriptions.controller.ts:48` |
| `/admin/subscriptions/:id` | GET | `subscriptions` | JWT/candidato | `subscriptions.read` | GLOBAL | No explícito | — | Implementado | `src/subscriptions/subscriptions.controller.ts:32` |
| `/admin/subscriptions/:id` | PATCH | `subscriptions` | JWT/candidato | `subscriptions.update` | GLOBAL | No explícito | — | Implementado | `src/subscriptions/subscriptions.controller.ts:38` |
| `/subscriptions` | GET | `subscriptions` | JWT/candidato | `subscriptions.read` | GLOBAL | No explícito | — | Implementado | `src/subscriptions/subscriptions.controller.ts:26` |
| `/subscriptions` | POST | `subscriptions` | JWT/candidato | `subscriptions.create` | GLOBAL | No explícito | — | Implementado | `src/subscriptions/subscriptions.controller.ts:20` |
| `/subscriptions/:id` | DELETE | `subscriptions` | JWT/candidato | `subscriptions.delete` | GLOBAL | No explícito | — | Implementado | `src/subscriptions/subscriptions.controller.ts:48` |
| `/subscriptions/:id` | GET | `subscriptions` | JWT/candidato | `subscriptions.read` | GLOBAL | No explícito | — | Implementado | `src/subscriptions/subscriptions.controller.ts:32` |
| `/subscriptions/:id` | PATCH | `subscriptions` | JWT/candidato | `subscriptions.update` | GLOBAL | No explícito | — | Implementado | `src/subscriptions/subscriptions.controller.ts:38` |
| `/admin/tenants` | GET | `tenants` | JWT/candidato | `tenants.read` | GLOBAL | No explícito | — | Implementado | `src/tenants/tenants.controller.ts:25` |
| `/admin/tenants` | POST | `tenants` | JWT/candidato | `tenants.create` | GLOBAL | No explícito | — | Implementado | `src/tenants/tenants.controller.ts:19` |
| `/admin/tenants/:id` | DELETE | `tenants` | JWT/candidato | `tenants.delete` | GLOBAL | No explícito | — | Implementado | `src/tenants/tenants.controller.ts:43` |
| `/admin/tenants/:id` | GET | `tenants` | JWT/candidato | `tenants.read` | GLOBAL | No explícito | — | Implementado | `src/tenants/tenants.controller.ts:31` |
| `/admin/tenants/:id` | PATCH | `tenants` | JWT/candidato | `tenants.update` | GLOBAL | No explícito | — | Implementado | `src/tenants/tenants.controller.ts:37` |
| `/tenants` | GET | `tenants` | JWT/candidato | `tenants.read` | GLOBAL | No explícito | — | Implementado | `src/tenants/tenants.controller.ts:25` |
| `/tenants` | POST | `tenants` | JWT/candidato | `tenants.create` | GLOBAL | No explícito | — | Implementado | `src/tenants/tenants.controller.ts:19` |
| `/tenants/:id` | DELETE | `tenants` | JWT/candidato | `tenants.delete` | GLOBAL | No explícito | — | Implementado | `src/tenants/tenants.controller.ts:43` |
| `/tenants/:id` | GET | `tenants` | JWT/candidato | `tenants.read` | GLOBAL | No explícito | — | Implementado | `src/tenants/tenants.controller.ts:31` |
| `/tenants/:id` | PATCH | `tenants` | JWT/candidato | `tenants.update` | GLOBAL | No explícito | — | Implementado | `src/tenants/tenants.controller.ts:37` |
| `/public/training-certificates/:code` | GET | `training` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/training/training-assessment-admin.controller.ts:273` |
| `/training/admin/analytics/compliance-policies` | GET | `training` | JWT/candidato | `training.analytics.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-analytics.controller.ts:82` |
| `/training/admin/analytics/compliance-policies` | POST | `training` | JWT/candidato | `training.compliance.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-analytics.controller.ts:88` |
| `/training/admin/analytics/effectiveness` | GET | `training` | JWT/candidato | `training.analytics.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-analytics.controller.ts:39` |
| `/training/admin/analytics/improvements` | GET | `training` | JWT/candidato | `training.analytics.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-analytics.controller.ts:58` |
| `/training/admin/analytics/improvements` | POST | `training` | JWT/candidato | `training.compliance.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-analytics.controller.ts:64` |
| `/training/admin/analytics/improvements/:improvementId` | PATCH | `training` | JWT/candidato | `training.compliance.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-analytics.controller.ts:71` |
| `/training/admin/analytics/intelligence` | GET | `training` | JWT/candidato | `training.analytics.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-analytics.controller.ts:45` |
| `/training/admin/analytics/intelligence` | POST | `training` | JWT/candidato | `training.compliance.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-analytics.controller.ts:51` |
| `/training/admin/analytics/overview` | GET | `training` | JWT/candidato | `training.analytics.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-analytics.controller.ts:33` |
| `/training/admin/assessment-attempts/:attemptId/grade` | PATCH | `training` | JWT/candidato | `training.assessment.grade` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:183` |
| `/training/admin/assessment-question-bank` | GET | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:143` |
| `/training/admin/assessment-question-bank` | POST | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:149` |
| `/training/admin/assessment-question-bank/:itemId` | DELETE | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:168` |
| `/training/admin/assessment-question-bank/:itemId` | PATCH | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:158` |
| `/training/admin/assessment-questions/:questionId` | DELETE | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:114` |
| `/training/admin/assessment-questions/:questionId` | PATCH | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:104` |
| `/training/admin/assessment-results` | GET | `training` | JWT/candidato | `training.progress.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:174` |
| `/training/admin/assessments` | GET | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:53` |
| `/training/admin/assessments/:quizId` | DELETE | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:87` |
| `/training/admin/assessments/:quizId` | GET | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:59` |
| `/training/admin/assessments/:quizId` | PATCH | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:76` |
| `/training/admin/assessments/:quizId/questions` | POST | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:94` |
| `/training/admin/assessments/:quizId/questions/import` | POST | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:123` |
| `/training/admin/assessments/:quizId/questions/order` | PUT | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:133` |
| `/training/admin/assignments` | GET | `training` | JWT/candidato | `training.progress.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assignment-admin.controller.ts:29` |
| `/training/admin/assignments` | POST | `training` | JWT/candidato | `training.assign` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assignment-admin.controller.ts:35` |
| `/training/admin/assignments/:assignmentId` | DELETE | `training` | JWT/candidato | `training.assign` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assignment-admin.controller.ts:42` |
| `/training/admin/blocks/:blockId` | DELETE | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:378` |
| `/training/admin/blocks/:blockId` | PATCH | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:368` |
| `/training/admin/blocks/:blockId/duplicate` | POST | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:384` |
| `/training/admin/categories` | GET | `training` | JWT/candidato | `training.course.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:400` |
| `/training/admin/categories` | POST | `training` | JWT/candidato | `training.course.create` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:406` |
| `/training/admin/categories/:categoryId` | PATCH | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:413` |
| `/training/admin/certificates` | GET | `training` | JWT/candidato | `training.progress.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:194` |
| `/training/admin/certificates` | POST | `training` | JWT/candidato | `training.certificate.issue` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:222` |
| `/training/admin/certificates/:certificateId/renew` | POST | `training` | JWT/candidato | `training.certificate.issue` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:248` |
| `/training/admin/certificates/:certificateId/revoke` | POST | `training` | JWT/candidato | `training.certificate.revoke` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:232` |
| `/training/admin/competencies` | GET | `training` | JWT/candidato | `training.course.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:120` |
| `/training/admin/competencies` | POST | `training` | JWT/candidato | `training.course.create` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:126` |
| `/training/admin/competencies/:competencyId` | PATCH | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:133` |
| `/training/admin/course-pilots/:pilotId/status` | PATCH | `training` | JWT/candidato | `training.course.review` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:263` |
| `/training/admin/courses` | GET | `training` | JWT/candidato | `training.course.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:60` |
| `/training/admin/courses` | POST | `training` | JWT/candidato | `training.course.create` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:78` |
| `/training/admin/courses/:courseId` | DELETE | `training` | JWT/candidato | `training.course.delete` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:220` |
| `/training/admin/courses/:courseId` | GET | `training` | JWT/candidato | `training.course.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:66` |
| `/training/admin/courses/:courseId` | PATCH | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:85` |
| `/training/admin/courses/:courseId/approve` | POST | `training` | JWT/candidato | `training.course.approve` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:160` |
| `/training/admin/courses/:courseId/archive` | POST | `training` | JWT/candidato | `training.course.archive` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:200` |
| `/training/admin/courses/:courseId/assessments` | POST | `training` | JWT/candidato | `training.assessment.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:65` |
| `/training/admin/courses/:courseId/certification-policy` | GET | `training` | JWT/candidato | `training.course.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:200` |
| `/training/admin/courses/:courseId/certification-policy` | PUT | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-assessment-admin.controller.ts:206` |
| `/training/admin/courses/:courseId/design` | GET | `training` | JWT/candidato | `training.course.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:107` |
| `/training/admin/courses/:courseId/design` | PUT | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:113` |
| `/training/admin/courses/:courseId/duplicate` | POST | `training` | JWT/candidato | `training.course.create` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:96` |
| `/training/admin/courses/:courseId/modules` | POST | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:273` |
| `/training/admin/courses/:courseId/modules/order` | PUT | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:306` |
| `/training/admin/courses/:courseId/pause` | POST | `training` | JWT/candidato | `training.course.publish` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:190` |
| `/training/admin/courses/:courseId/pilots` | POST | `training` | JWT/candidato | `training.course.review` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:253` |
| `/training/admin/courses/:courseId/preview` | GET | `training` | JWT/candidato | `training.course.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:72` |
| `/training/admin/courses/:courseId/publish` | POST | `training` | JWT/candidato | `training.course.publish` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:180` |
| `/training/admin/courses/:courseId/quality` | GET | `training` | JWT/candidato | `training.course.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:227` |
| `/training/admin/courses/:courseId/quality/reviews` | POST | `training` | JWT/candidato | `training.course.review` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:233` |
| `/training/admin/courses/:courseId/retire` | POST | `training` | JWT/candidato | `training.course.archive` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:210` |
| `/training/admin/courses/:courseId/return-draft` | POST | `training` | JWT/candidato | `training.course.review` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:150` |
| `/training/admin/courses/:courseId/schedule` | POST | `training` | JWT/candidato | `training.course.publish` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:170` |
| `/training/admin/courses/:courseId/submit-review` | POST | `training` | JWT/candidato | `training.course.review` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:140` |
| `/training/admin/launches` | GET | `training` | JWT/candidato | `training.progress.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-launch.controller.ts:19` |
| `/training/admin/launches` | POST | `training` | JWT/candidato | `training.assign` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-launch.controller.ts:25` |
| `/training/admin/launches/:launchId/deploy` | POST | `training` | JWT/candidato | `training.assign` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-launch.controller.ts:32` |
| `/training/admin/launches/:launchId/status` | PATCH | `training` | JWT/candidato | `training.assign` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-launch.controller.ts:39` |
| `/training/admin/lessons/:lessonId` | DELETE | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:336` |
| `/training/admin/lessons/:lessonId` | PATCH | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:326` |
| `/training/admin/lessons/:lessonId/blocks` | POST | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:358` |
| `/training/admin/lessons/:lessonId/blocks/order` | PUT | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:390` |
| `/training/admin/lessons/:lessonId/duplicate` | POST | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:342` |
| `/training/admin/modules/:moduleId` | DELETE | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:294` |
| `/training/admin/modules/:moduleId` | PATCH | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:284` |
| `/training/admin/modules/:moduleId/duplicate` | POST | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:300` |
| `/training/admin/modules/:moduleId/lessons` | POST | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:316` |
| `/training/admin/modules/:moduleId/lessons/order` | PUT | `training` | JWT/candidato | `training.course.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:348` |
| `/training/admin/operations` | GET | `training` | JWT/candidato | `training.integrations.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-operations.controller.ts:19` |
| `/training/admin/operations/execute` | POST | `training` | JWT/candidato | `training.integrations.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-operations.controller.ts:25` |
| `/training/admin/quality-reviews/:reviewId/decision` | PATCH | `training` | JWT/candidato | `training.course.approve` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-admin.controller.ts:243` |
| `/training/analytics` | GET | `training` | JWT/candidato | `training.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:82` |
| `/training/assignments` | GET | `training` | JWT/candidato | `training.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:58` |
| `/training/catalog` | GET | `training` | JWT/candidato | `training.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:64` |
| `/training/certificates` | GET | `training` | JWT/candidato | `training.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:191` |
| `/training/courses/:courseId` | GET | `training` | JWT/candidato | `training.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:88` |
| `/training/curriculums/:curriculumId` | GET | `training` | JWT/candidato | `training.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:94` |
| `/training/events` | GET | `training` | JWT/candidato | `training.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:76` |
| `/training/favorites` | DELETE | `training` | JWT/candidato | `training.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:110` |
| `/training/favorites` | POST | `training` | JWT/candidato | `training.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:104` |
| `/training/integrations` | GET | `training` | JWT/candidato | `training.integrations.manage, training.integrations.manage, training.integrations.manage` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-integrations.controller.ts:22` |
| `/training/integrations` | GET | `training` | JWT/candidato | `training.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-integrations.controller.ts:31` |
| `/training/integrations/scorm-packages/:id/launch-url` | GET | `training` | JWT/candidato | `training.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training-integrations.controller.ts:41` |
| `/training/library` | GET | `training` | JWT/candidato | `training.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:70` |
| `/training/module-access` | GET | `training` | JWT/candidato | — | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:47` |
| `/training/overview` | GET | `training` | JWT/candidato | `training.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:52` |
| `/training/pilots` | GET | `training` | JWT/candidato | `training.read` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:197` |
| `/training/pilots/:pilotId/feedback` | POST | `training` | JWT/candidato | `training.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:203` |
| `/training/progress/course/:courseId` | PATCH | `training` | JWT/candidato | `training.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:116` |
| `/training/progress/lessons/:lessonId` | PATCH | `training` | JWT/candidato | `training.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:136` |
| `/training/progress/step/:stepId` | PATCH | `training` | JWT/candidato | `training.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:126` |
| `/training/quizzes/:quizId/attempts` | POST | `training` | JWT/candidato | `training.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:151` |
| `/training/quizzes/:quizId/attempts/:attemptId/answers` | POST | `training` | JWT/candidato | `training.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:157` |
| `/training/quizzes/:quizId/attempts/:attemptId/submit` | POST | `training` | JWT/candidato | `training.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/training/training.controller.ts:174` |
| `/training/scorm` | GET | `training` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/training/training-integrations.controller.ts:61` |
| `/training/scorm/:id/launch` | GET | `training` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/training/training-integrations.controller.ts:55` |
| `/company/users` | GET | `users` | JWT/candidato | `users.read` | TENANT | No explícito | — | Implementado | `src/users/users.controller.ts:40` |
| `/company/users` | POST | `users` | JWT/candidato | `users.create` | TENANT | No explícito | — | Implementado | `src/users/users.controller.ts:34` |
| `/company/users/:id` | DELETE | `users` | JWT/candidato | `users.delete` | TENANT | No explícito | — | Implementado | `src/users/users.controller.ts:63` |
| `/company/users/:id` | GET | `users` | JWT/candidato | `users.read` | TENANT | No explícito | — | Implementado | `src/users/users.controller.ts:46` |
| `/company/users/:id` | PATCH | `users` | JWT/candidato | `users.update` | TENANT | No explícito | — | Implementado | `src/users/users.controller.ts:52` |
| `/users` | GET | `users` | JWT/candidato | `users.read` | TENANT | No explícito | — | Implementado | `src/users/users.controller.ts:40` |
| `/users` | POST | `users` | JWT/candidato | `users.create` | TENANT | No explícito | — | Implementado | `src/users/users.controller.ts:34` |
| `/users/:id` | DELETE | `users` | JWT/candidato | `users.delete` | TENANT | No explícito | — | Implementado | `src/users/users.controller.ts:63` |
| `/users/:id` | GET | `users` | JWT/candidato | `users.read` | TENANT | No explícito | — | Implementado | `src/users/users.controller.ts:46` |
| `/users/:id` | PATCH | `users` | JWT/candidato | `users.update` | TENANT | No explícito | — | Implementado | `src/users/users.controller.ts:52` |
| `/users/global` | GET | `users` | JWT/candidato | `users.read` | GLOBAL | No explícito | — | Implementado | `src/users/users.controller.ts:21` |
| `/public/vacancies` | GET | `vacancies` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/vacancies/public-vacancies.controller.ts:7` |
| `/public/vacancies/:id` | GET | `vacancies` | Público/interno | — | PUBLIC | No explícito | — | Implementado | `src/vacancies/public-vacancies.controller.ts:12` |
| `/vacancies` | GET | `vacancies` | JWT/candidato | `vacancies.read` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:39` |
| `/vacancies` | POST | `vacancies` | JWT/candidato | `vacancies.create` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:33` |
| `/vacancies/:id` | GET | `vacancies` | JWT/candidato | `vacancies.read` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:124` |
| `/vacancies/:id` | PATCH | `vacancies` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:166` |
| `/vacancies/:id/archive` | POST | `vacancies` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:90` |
| `/vacancies/:id/clone` | POST | `vacancies` | JWT/candidato | `vacancies.create` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:80` |
| `/vacancies/:id/history` | GET | `vacancies` | JWT/candidato | `vacancies.read` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:100` |
| `/vacancies/:id/image/:imageId` | DELETE | `vacancies` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:149` |
| `/vacancies/:id/image/versions` | GET | `vacancies` | JWT/candidato | `vacancies.read` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:143` |
| `/vacancies/form-templates` | GET | `vacancies` | JWT/candidato | `vacancies.read` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:106` |
| `/vacancies/form-templates` | POST | `vacancies` | JWT/candidato | `vacancies.create` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:112` |
| `/vacancies/form-templates/:id/delete` | PATCH | `vacancies` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:118` |
| `/vacancies/requisitions` | POST | `vacancies` | JWT/candidato | `vacancies.create` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:45` |
| `/vacancies/requisitions/:id/approve` | POST | `vacancies` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:60` |
| `/vacancies/requisitions/:id/reject` | POST | `vacancies` | JWT/candidato | `vacancies.update` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:70` |
| `/vacancies/requisitions/list` | GET | `vacancies` | JWT/candidato | `vacancies.read` | TENANT | No explícito | `ATS` | Implementado | `src/vacancies/vacancies.controller.ts:51` |
| `/workflow-master` | GET | `workflow-master` | JWT/candidato | `workflow_master.read` | TENANT | No explícito | — | Implementado | `src/workflow-master/workflow-master.controller.ts:14` |
| `/workflow-master/:employeeId` | GET | `workflow-master` | JWT/candidato | `workflow_master.read` | TENANT | No explícito | — | Implementado | `src/workflow-master/workflow-master.controller.ts:20` |
| `/workflow-steps/:id/progress` | PATCH | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflow-steps.controller.ts:29` |
| `/workflow-steps/:id/status` | PATCH | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflow-steps.controller.ts:19` |
| `/workflows` | GET | `workflows` | JWT/candidato | `employees.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:58` |
| `/workflows/:employeeId/current` | GET | `workflows` | JWT/candidato | `employees.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:64` |
| `/workflows/:id` | GET | `workflows` | JWT/candidato | `employees.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:70` |
| `/workflows/:id/activate-training` | POST | `workflows` | JWT/candidato | `training.update` | TENANT | No explícito | `TRAINING` | Implementado | `src/workflows/workflows.controller.ts:147` |
| `/workflows/:id/archive-record` | POST | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:173` |
| `/workflows/:id/assign-asset` | POST | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `INVENTORY` | Implementado | `src/workflows/workflows.controller.ts:140` |
| `/workflows/:id/blockers` | GET | `workflows` | JWT/candidato | `employees.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:88` |
| `/workflows/:id/close-access` | POST | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:167` |
| `/workflows/:id/complete-onboarding` | POST | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:128` |
| `/workflows/:id/complete-signature` | POST | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:134` |
| `/workflows/:id/events` | POST | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:94` |
| `/workflows/:id/master-card` | GET | `workflows` | JWT/candidato | `employees.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:76` |
| `/workflows/:id/provision-access` | POST | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:154` |
| `/workflows/:id/recompute` | PATCH | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:179` |
| `/workflows/:id/recover-asset` | POST | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `INVENTORY` | Implementado | `src/workflows/workflows.controller.ts:160` |
| `/workflows/:id/steps/:stepKey/complete` | PATCH | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:114` |
| `/workflows/:id/steps/:stepKey/start` | PATCH | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:100` |
| `/workflows/:id/timeline` | GET | `workflows` | JWT/candidato | `employees.read` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:82` |
| `/workflows/branch-transfer` | POST | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:46` |
| `/workflows/hiring` | POST | `workflows` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS, ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:25` |
| `/workflows/hiring/context/:applicationId` | GET | `workflows` | JWT/candidato | `applications.update` | TENANT | No explícito | `ATS, ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:32` |
| `/workflows/offboarding` | POST | `workflows` | JWT/candidato | `employees.update` | TENANT | No explícito | `ONBOARDING` | Implementado | `src/workflows/workflows.controller.ts:52` |

## Limitaciones del inventario

- El análisis estático expande aliases declarados en `@Controller(...)`; por eso una misma operación puede aparecer bajo más de una URL.
- Los permisos heredados a nivel de clase pueden no aparecer en la columna si fueron sobrescritos por metadatos de método; se debe interpretar junto con la evidencia fuente.
- Rutas creadas dinámicamente fuera de controladores Nest no fueron detectadas; no se encontraron routers Express adicionales en la inspección inicial.
