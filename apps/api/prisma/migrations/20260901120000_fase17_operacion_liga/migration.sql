ALTER TYPE "EstadoPartido" ADD VALUE 'CANCELADO';

ALTER TABLE "organizaciones"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "zonaHoraria" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires';

ALTER TABLE "torneos" ADD COLUMN "slug" TEXT;
ALTER TABLE "partidos" ADD COLUMN "motivoCancelacion" TEXT;

UPDATE "organizaciones"
SET "slug" = trim(BOTH '-' FROM regexp_replace(lower("nombre"), '[^a-z0-9]+', '-', 'g')) || '-' || left("id"::text, 8)
WHERE "slug" IS NULL;

UPDATE "torneos"
SET "slug" = trim(BOTH '-' FROM regexp_replace(lower("nombre"), '[^a-z0-9]+', '-', 'g')) || '-' || left("id"::text, 8)
WHERE "slug" IS NULL;

CREATE UNIQUE INDEX "organizaciones_slug_key" ON "organizaciones"("slug");
CREATE UNIQUE INDEX "torneos_slug_key" ON "torneos"("slug");
