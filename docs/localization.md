# Localization Contract

The backend is the source of truth for locale configuration. Supported locales are `es` and `en`; every unknown or disabled locale falls back deterministically to the configured fallback, then to `es`.

## Configuration endpoints

All routes are prefixed with `/api` unless `DISABLE_GLOBAL_PREFIX=true`.

| Method | Route | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/localization/config` | Public | Read global defaults and enabled locales. |
| GET | `/career-portals/:portalSlug/localization` | Public | Read the active portal locale configuration. |
| GET | `/career-portals/:portalSlug/localization/resolve` | Public | Resolve the effective locale for a portal. |
| PATCH | `/career-portals/:portalSlug/localization` | Portal tenant admin or super admin | Update portal locale settings. |
| GET | `/admin/localization` | Super admin | Read global settings. |
| PATCH | `/admin/localization` | Super admin | Update global settings. |
| GET | `/companies/:companyId/localization` | Same tenant or super admin | Read company settings. |
| PATCH | `/companies/:companyId/localization` | Same tenant or super admin | Update company settings. |
| GET | `/me/preferences/locale` | Authenticated user | Read the user's preferred locale. |
| PATCH | `/me/preferences/locale` | Authenticated user | Set `{"locale":"es"}` or `{"locale":"en"}`. |

## Resolution rules

1. A locale is normalized from `es-MX` or `en-US` to its base language.
2. The requested locale is used only when enabled by the active scope.
3. Otherwise the scope fallback is used when enabled.
4. Otherwise `es` is used.

The middleware applies this rule to `X-Locale`, then `Accept-Language`, and always emits `Content-Language`. Invalid configuration is rejected with `400`; cross-tenant company access is rejected with `403`.

## Vacancy translations

Vacancy create/update requests may include an additive `translations` object. Only `es` and `en` are accepted by the public resolver, and each translated field falls back independently to the canonical vacancy field:

```json
{
  "translations": {
    "en": {
      "title": "Warehouse Associate",
      "summary": "Join our operations team"
    }
  }
}
```

Public vacancy responses select the locale from `X-Locale` and never expose the internal `translations` object.

## Backend Docker Compose

`docker-compose.yml` runs only the backend from the GHCR image and uses Railway PostgreSQL through `DATABASE_URL`. It is intended to be pasted/imported as a Portainer Stack; the Portainer host does not build the image:

```bash
cp .env.docker.example .env.docker
# Set DATABASE_URL in Portainer Stack environment variables.
docker compose --env-file .env.docker pull backend
docker compose --env-file .env.docker up -d backend
docker compose ps
```

It does not create a local PostgreSQL container or build a local image. This prevents local data from being mistaken for the Railway database. GitHub Actions publishes `ghcr.io/paulgarcia89/saas-integral-backend:latest`, and the container runs `prisma migrate deploy` before starting the API.

## Complete Portainer Stack

For a self-contained Portainer installation with PostgreSQL, Redis, backend, and frontend, use `docker-compose.portainer.yml` and the variables in `.env.portainer.example`:

1. Create a new Portainer Stack and paste `docker-compose.portainer.yml`.
2. Add the values from `.env.portainer.example` under Stack environment variables. Replace every `REPLACE_WITH` value and set the real public frontend URL.
3. Log in to GHCR from the Portainer registry settings if either image is private.
4. Deploy the Stack. Portainer pulls the published images; it does not build them locally.

The frontend is available on `FRONTEND_PORT` and proxies `/api` to the backend over the private Compose network. PostgreSQL and Redis are not exposed to the host. The backend container runs `prisma migrate deploy` during startup and all four data volumes are persistent. Pin `BACKEND_IMAGE_TAG` and `FRONTEND_IMAGE_TAG` to a tested commit tag before production instead of using `latest`.

## Recovering a failed Prisma migration

If an existing database reports `P3009` for `20260825160000_restaurant_commercial_branch_cost_indexes`, deploy an image containing the idempotent migration first, then run these commands once from the backend container or a temporary shell with the production `DATABASE_URL`:

```bash
pnpm exec prisma migrate resolve --rolled-back 20260825160000_restaurant_commercial_branch_cost_indexes
pnpm exec prisma migrate deploy
```

The rollback resolution only clears Prisma's failed-migration marker; it does not drop tables or delete application data. The migration now uses `CREATE INDEX IF NOT EXISTS`, so indexes created before the failure are preserved and missing indexes are added. Do not use `migrate resolve --applied` unless the database has been independently verified to contain every statement from that migration.

## Email delivery configuration

The delivery worker persists every attempt in `NotificationDelivery`. Configure exactly one provider in Portainer. For Resend, set `EMAIL_PROVIDER=RESEND`, a valid `RESEND_API_KEY`, and a sender address from a verified domain. For SMTP, set `EMAIL_PROVIDER=SMTP`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and use `SMTP_PORT=465` with `SMTP_SECURE=true` or `SMTP_PORT=587` with `SMTP_SECURE=false`. `SMTP_FAMILY=4` is recommended on hosts without IPv6 routing.

`Connection timeout` means the worker reached the provider branch but could not establish or complete the network connection within the configured timeout; it is not a successful delivery. After changing variables, redeploy/restart the backend container and retry one failed delivery. Do not mark the delivery as successful manually.

## Response and error conventions

Message catalogs use stable codes such as `common.unauthorized` and `applications.submitted`. Clients should render the code through their catalog rather than matching translated text. Existing domain responses remain unchanged until their module is migrated to these codes; this prevents a silent contract change during rollout.

## Rollout note

The migration is additive and defaults existing tenants and portals to Spanish. Vacancy/form field translation storage and email-template migration are intentionally separate follow-up changes so existing application payloads are not rewritten.
