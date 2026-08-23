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

## Video con seguimiento confiable

La funcionalidad reutiliza cursos, módulos, lecciones y asignaciones existentes. `TrainingVideoProgress` y `TrainingVideoProgressEvent` guardan el tiempo acreditado y la auditoría aislada por tenant.

Administración:

- `POST /api/training/admin/courses/:courseId/video`: crea o actualiza una lección de video. En multipart usa `file` para MP4 o `videoUrl` para una URL HTTPS autorizada. Requiere `training.course.update`.
- `GET /api/training/admin/courses/:courseId/progress`: reporte de empleados, estados y actividad. Requiere `training.progress.read`.
- Las asignaciones existentes se crean con `POST /api/training/admin/assignments` y se publican con `POST /api/training/admin/courses/:courseId/publish`.

Empleado:

- `GET /api/training/video/assignments`
- `GET /api/training/video/assignments/:assignmentId`
- `GET /api/training/video/assignments/:assignmentId/progress`
- `POST /api/training/video/start`
- `POST /api/training/video/heartbeat`
- `POST /api/training/video/pause`
- `POST /api/training/video/ended`
- `POST /api/training/video/seek`
- `GET /api/training/video/assignments/:assignmentId/lessons/:lessonId/file`

El heartbeat recomendado es cada 10 segundos. El servidor ignora el porcentaje del cliente, no acredita pausas ni saltos grandes, limita `playbackRate` a `0.5..2`, usa transacciones y conserva el primer `completedAt`. El archivo usa el almacenamiento SCORM S3/R2 o local existente; configure `TRAINING_VIDEO_MAX_UPLOAD_BYTES` y `TRAINING_VIDEO_ALLOWED_HOSTS`.
