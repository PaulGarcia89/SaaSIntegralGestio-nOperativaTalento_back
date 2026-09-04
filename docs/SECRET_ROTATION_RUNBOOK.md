# Runbook — Rotación de secretos expuestos

Origen: auditoría de arquitectura del 2026-09-04 (`AUDITORIA_ARQUITECTURA_2026-09-04.md`, hallazgo CRÍTICO-1).

## Qué se corrigió en el repositorio

`docker-compose.lan.yml` ya no contiene valores literales: todos los secretos se inyectan por interpolación obligatoria (`${VAR:?mensaje}`), de modo que **el arranque falla de forma explícita** si falta alguno en lugar de continuar con un valor vacío. Las plantillas `.env.portainer.example`, `.env.self-hosted.example` y `FrontEnd/deploy/.env.external.example` fueron saneadas con marcadores de posición. Se añadió `.env.lan.example`, se amplió el `.gitignore` y se incorporó un job `secret-scan` (gitleaks) al CI de ambos repositorios.

**Esto elimina la exposición futura, no la pasada.** Los valores siguen en el historial de git y deben considerarse comprometidos.

## Qué falta por hacer — requiere acción humana

### 1. Inventario de dónde vive cada valor

| Variable | Dónde se usa |
|---|---|
| `JWT_ACCESS_SECRET` | Firma de tokens de acceso. **Además** es el respaldo actual de la firma de archivos privados (`ats-private-file.service.ts:277`) |
| `JWT_REFRESH_SECRET` | Firma de tokens de refresco |
| `POSTGRES_PASSWORD` | Base de datos (también incrustada en `DATABASE_URL`) |
| `SUPERADMIN_PASSWORD` | Semilla del superadministrador (`prisma/seed.ts`) |
| `SCORM_SIGNING_KEY` | Firma de paquetes SCORM |
| `WEBHOOK_ENCRYPTION_KEY` | Cifrado de configuración de webhooks |

Comprobar si estos mismos valores se reutilizan en Railway, Render, Portainer o en el despliegue self-hosted. **Si un valor se usó en más de un entorno, rotarlo en todos.**

### 2. Generar valores nuevos

```bash
mkdir -p deploy && cp .env.lan.example deploy/.env.lan
for k in JWT_ACCESS_SECRET JWT_REFRESH_SECRET SCORM_SIGNING_KEY WEBHOOK_ENCRYPTION_KEY; do
  echo "$k=$(openssl rand -hex 32)"
done
# POSTGRES_PASSWORD y SUPERADMIN_PASSWORD: generar aparte y guardarlos en el gestor de contraseñas
```

### 3. Aplicar la rotación — en este orden

1. **Ventana de baja actividad.** Rotar `JWT_ACCESS_SECRET` invalida todas las sesiones activas: todos los usuarios tendrán que volver a iniciar sesión.
2. Definir primero `ATS_FILE_SIGNING_SECRET` con un valor propio, **antes** de tocar `JWT_ACCESS_SECRET`. Si no, los enlaces a currículums y documentos dejan de validar (caducan solos en ≤ 15 min, pero conviene evitar el hueco).
3. Actualizar las variables en cada entorno.
4. Cambiar la contraseña de PostgreSQL y actualizar `DATABASE_URL` en todos los servicios que la consumen.
5. Redesplegar backend y workers.
6. Revocar explícitamente las sesiones que hubiera:
   ```sql
   UPDATE "UserSession" SET "revokedAt" = now() WHERE "revokedAt" IS NULL;
   ```
7. Cambiar la contraseña del superadministrador desde la aplicación, no solo en la variable de entorno (la semilla solo actúa en la creación inicial).

### 4. Verificar

```bash
docker compose --env-file deploy/.env.lan -f docker-compose.lan.yml config >/dev/null   # falla si falta algún secreto
curl -fsS http://<host>/api/health
./gitleaks detect --no-git --source . --config .gitleaks.toml --redact          # sin hallazgos
```

### 5. Historial de git — decisión pendiente

Los valores antiguos permanecen en los commits anteriores. Dos caminos:

- **Purgar** con `git filter-repo --path docker-compose.lan.yml --invert-paths` (o `--replace-text`) y forzar la reescritura. Reescribe todos los hashes: coordinar con quien tenga clones y ramas abiertas.
- **Asumir la exposición histórica** si el repositorio es privado y de acceso restringido, dejando constancia de la rotación. Es defendible **solo** si la rotación del paso 3 se completó, porque entonces los valores del historial ya no abren ninguna puerta.

Una vez purgado el historial, retirar `--no-git` del job `secret-scan` en ambos workflows para que el escaneo cubra también los commits.

## Prevención

- El job `secret-scan` bloquea nuevos secretos en cada PR.
- `.gitleaks.toml` permite los marcadores `replace-with-*` de las plantillas sin generar ruido.
- Regla de trabajo: **ningún archivo versionado contiene un valor de secreto**; los `.env.*.example` solo llevan marcadores.
