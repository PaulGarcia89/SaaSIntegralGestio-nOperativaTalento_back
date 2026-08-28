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

`docker-compose.yml` runs only the backend and uses Railway PostgreSQL through `DATABASE_URL`:

```bash
cp .env.docker.example .env.docker
# Set DATABASE_URL in .env.docker to the Railway value.
docker compose up --build -d backend
docker compose ps
```

It does not create a local PostgreSQL container. This prevents local data from being mistaken for the Railway database. The image runs `prisma migrate deploy` before starting the API.

## Response and error conventions

Message catalogs use stable codes such as `common.unauthorized` and `applications.submitted`. Clients should render the code through their catalog rather than matching translated text. Existing domain responses remain unchanged until their module is migrated to these codes; this prevents a silent contract change during rollout.

## Rollout note

The migration is additive and defaults existing tenants and portals to Spanish. Vacancy/form field translation storage and email-template migration are intentionally separate follow-up changes so existing application payloads are not rewritten.
