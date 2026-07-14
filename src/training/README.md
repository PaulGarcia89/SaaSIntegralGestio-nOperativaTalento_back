# Training Module

Modulo backend para `Capacitacion / Escuela de induccion`.

## Endpoints principales

- `GET /training/module-access`
- `GET /training/overview`
- `GET /training/assignments`
- `GET /training/catalog`
- `GET /training/library`
- `GET /training/events`
- `GET /training/analytics`
- `GET /training/courses/:courseId`
- `GET /training/curriculums/:curriculumId`
- `POST /training/favorites`
- `DELETE /training/favorites`
- `PATCH /training/progress/course/:courseId`
- `PATCH /training/progress/step/:stepId`
- `POST /training/quizzes/:quizId/attempts`
- `POST /training/quizzes/:quizId/attempts/:attemptId/answers`
- `POST /training/quizzes/:quizId/attempts/:attemptId/submit`
- `GET /training/certificates`

## Seguridad

- `JwtAuthGuard`
- `TenantGuard`
- `SubscriptionGuard`
- `TrainingAccessGuard`
- `PermissionGuard`

Permisos:

- lectura: `training.read`
- escritura: `training.update`
