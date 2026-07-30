# Publicar el sistema en tu red interna

## Qué deja listo este stack

- PostgreSQL solo interno entre contenedores
- Backend NestJS en red interna del compose
- Frontend Next.js en red interna del compose
- Nginx expuesto en `80` para entrar desde cualquier equipo de tu casa

Desde otro equipo en tu red vas a entrar así:

`http://IP_DE_TU_PC/`

Ejemplo:

`http://192.168.1.50/`

## Requisitos

- Docker Desktop instalado
- Puertos libres:
  - `80`

## Cómo levantarlo

Desde [BackEnd](/Users/paulgarcia/Documents/ProyectosDesarrollo/SaaSIntegralGestiónOperativaTalentoEmpresarial/BackEnd):

```bash
docker compose -f docker-compose.lan.yml up -d --build
```

## Cómo sembrar datos iniciales

La primera vez:

```bash
docker compose -f docker-compose.lan.yml run --rm backend npm run seed
```

## Cómo ver tu IP local

En macOS:

```bash
ipconfig getifaddr en0
```

Si usas Ethernet a veces será:

```bash
ipconfig getifaddr en1
```

## Cómo entrar desde otro equipo

Abre en el navegador:

```text
http://TU_IP_LOCAL/
```

El backend quedará detrás del proxy en:

```text
http://TU_IP_LOCAL/api
```

## Usuario inicial

- email: `superadmin@saasintegral.com`
- password: `3mNJlb7KLQincjn2SDsqBYn9K+aPVL1B`

Conviene cambiar esa contraseña antes de dejarlo estable en tu red.

## Comandos útiles

Ver logs:

```bash
docker compose -f docker-compose.lan.yml logs -f
```

Apagar:

```bash
docker compose -f docker-compose.lan.yml down
```

Apagar sin borrar data:

```bash
docker compose -f docker-compose.lan.yml stop
```

Borrar contenedores pero conservar base:

```bash
docker compose -f docker-compose.lan.yml down
```

Borrar también la data de Postgres:

```bash
docker compose -f docker-compose.lan.yml down -v
```

## Nota importante

En [docker-compose.lan.yml](/Users/paulgarcia/Documents/ProyectosDesarrollo/SaaSIntegralGestiónOperativaTalentoEmpresarial/BackEnd/docker-compose.lan.yml) la base ya no queda expuesta a la LAN. Aun así, si quieres endurecerlo más, cambia:

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `SUPERADMIN_PASSWORD`
