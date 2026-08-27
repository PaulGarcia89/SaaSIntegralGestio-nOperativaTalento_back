-- Replace legacy UUID-based public slugs with stable, human-readable slugs.
UPDATE "JobPublication" jp
SET "publicSlug" = concat(
  trim(both '-' from regexp_replace(lower(v."title"), '[^a-z0-9]+', '-', 'g')),
  '-',
  left(replace(v."id", '-', ''), 8)
)
FROM "Vacancy" v
WHERE jp."vacancyId" = v."id"
  AND jp."publicSlug" = v."id";
