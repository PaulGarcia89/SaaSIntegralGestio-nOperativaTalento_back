# Deploy en Render

## Requisitos

- Repositorio backend subido a GitHub
- Cuenta de Render

## Variables importantes

- `DATABASE_URL`: la asigna Render desde PostgreSQL gestionado
- `JWT_ACCESS_SECRET`: secreto de access token
- `JWT_REFRESH_SECRET`: secreto de refresh token
- `SUPERADMIN_EMAIL`: correo del administrador inicial
- `SUPERADMIN_PASSWORD`: clave del administrador inicial
- `CORS_ALLOWED_ORIGINS`: URL del frontend, por ejemplo `https://tu-frontend.vercel.app`

## Pasos

1. Sube este backend a tu repositorio GitHub.
2. En Render, crea un `Blueprint` desde el repo.
3. Render detectará `render.yaml` y propondrá:
   - una base PostgreSQL
   - un web service para NestJS
4. Configura `CORS_ALLOWED_ORIGINS` con la URL pública de tu frontend.
5. Ejecuta el primer deploy.
6. Prueba `GET /api/openapi.json`.

## Inicio de la app

El contenedor:

1. instala dependencias
2. compila NestJS
3. ejecuta `prisma migrate deploy`
4. arranca con `npm run start:prod`
