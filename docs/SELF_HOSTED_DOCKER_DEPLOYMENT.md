# Despliegue Docker self-hosted

Este paquete despliega frontend, backend, PostgreSQL, Redis y Nginx fuera de Railway. No migra ni elimina datos de Railway por sí mismo.

## Preparación

El administrador debe colocar el backend y el frontend en directorios hermanos, por ejemplo:

```text
/opt/saas/
  backend/
  frontend-app/
```

En `backend/.env.self-hosted` se copian los valores de `.env.self-hosted.example`. Las credenciales no deben entrar en Git ni en la imagen Docker.

Si la estructura es distinta, ajustar `FRONTEND_CONTEXT` en el archivo `.env.self-hosted` o al ejecutar Compose.

## Arranque

```bash
cp .env.self-hosted.example .env.self-hosted
chmod 600 .env.self-hosted
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml config
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml build
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml up -d
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml ps
curl -f http://127.0.0.1/healthz
```

El contenedor backend ejecuta `prisma migrate deploy` antes de iniciar NestJS. Las migraciones son forward-only y no deben ejecutarse con `prisma migrate reset` en producción.

## S3 y DocuSeal

El ejemplo utiliza tres buckets para evitar mezclar documentos, archivos ATS y paquetes SCORM. Si el proveedor solo permite el bucket `docuseal`, se puede usar ese bucket en las tres variables, siempre que las políticas de acceso y los prefijos estén aislados.

`DOCUSEAL_BASE_URL` debe ser `https://docuseal.lessacorp.com`. Registrar el webhook de DocuSeal hacia:

```text
https://api.example.com/webhooks/docuseal?secret=DOCUSEAL_WEBHOOK_SECRET
```

## HTTPS y firewall

Este Compose expone HTTP en `HTTP_PORT` (80 por defecto). En producción, el administrador debe terminar TLS con el reverse proxy del servidor o añadir certificados al gateway. Solo deben publicarse los puertos 80/443; PostgreSQL y Redis no se exponen al host.

## Operación

```bash
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml logs -f backend
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml pull
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml up -d --build
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml down
```

Antes de actualizar, ejecutar el backup PostgreSQL del proyecto y verificarlo. Railway debe permanecer activo hasta completar las pruebas de autenticación, carga de archivos, firmas DocuSeal, colas, inventario y reportes.
