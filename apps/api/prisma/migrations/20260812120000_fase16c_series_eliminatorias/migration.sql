ALTER TYPE "MetodoResolucionLlave" ADD VALUE IF NOT EXISTS 'RESULTADO_GLOBAL';
ALTER TYPE "MetodoResolucionLlave" ADD VALUE IF NOT EXISTS 'ALARGUE';
ALTER TYPE "MetodoResolucionLlave" ADD VALUE IF NOT EXISTS 'PENALES';

CREATE TYPE "FormatoSerieEliminatoria" AS ENUM ('PARTIDO_UNICO', 'IDA_VUELTA');
CREATE TYPE "TipoRondaEliminatoria" AS ENUM ('PRINCIPAL', 'TERCER_PUESTO');
CREATE TYPE "TipoDefinicionLlave" AS ENUM ('PENALES', 'ADMINISTRATIVA');

ALTER TABLE "rondas_eliminatorias"
  ADD COLUMN "tipo" "TipoRondaEliminatoria" NOT NULL DEFAULT 'PRINCIPAL',
  ADD COLUMN "formatoSerie" "FormatoSerieEliminatoria" NOT NULL DEFAULT 'PARTIDO_UNICO',
  ADD COLUMN "permiteAlargue" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "permitePenales" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "configuracionSnapshot" JSONB,
  ADD COLUMN "reglasCongeladasEn" TIMESTAMP(3);

ALTER TABLE "llaves_competencia"
  ADD COLUMN "llavePerdedorSiguienteId" UUID,
  ADD COLUMN "ladoPerdedorSiguiente" TEXT;

ALTER TABLE "partidos"
  ADD COLUMN "ordenSerie" INTEGER,
  ADD COLUMN "golesLocalReglamentario" INTEGER,
  ADD COLUMN "golesVisitanteReglamentario" INTEGER;

CREATE TABLE "definiciones_llave" (
  "id" UUID NOT NULL,
  "llaveCompetenciaId" UUID NOT NULL,
  "tipo" "TipoDefinicionLlave" NOT NULL,
  "participacionLocalId" UUID NOT NULL,
  "participacionVisitanteId" UUID NOT NULL,
  "penalesLocal" INTEGER,
  "penalesVisitante" INTEGER,
  "ganadorParticipacionId" UUID NOT NULL,
  "motivo" TEXT,
  "creadoPorId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "definiciones_llave_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rondas_eliminatorias_faseCompetenciaId_tipo_idx" ON "rondas_eliminatorias"("faseCompetenciaId", "tipo");
CREATE INDEX "llaves_competencia_llavePerdedorSiguienteId_idx" ON "llaves_competencia"("llavePerdedorSiguienteId");
CREATE UNIQUE INDEX "partidos_llaveCompetenciaId_ordenSerie_key" ON "partidos"("llaveCompetenciaId", "ordenSerie");
CREATE INDEX "partidos_llaveCompetenciaId_ordenSerie_idx" ON "partidos"("llaveCompetenciaId", "ordenSerie");
CREATE UNIQUE INDEX "definiciones_llave_llaveCompetenciaId_key" ON "definiciones_llave"("llaveCompetenciaId");
CREATE INDEX "definiciones_llave_participacionLocalId_idx" ON "definiciones_llave"("participacionLocalId");
CREATE INDEX "definiciones_llave_participacionVisitanteId_idx" ON "definiciones_llave"("participacionVisitanteId");
CREATE INDEX "definiciones_llave_ganadorParticipacionId_idx" ON "definiciones_llave"("ganadorParticipacionId");

ALTER TABLE "llaves_competencia" ADD CONSTRAINT "llaves_competencia_llavePerdedorSiguienteId_fkey" FOREIGN KEY ("llavePerdedorSiguienteId") REFERENCES "llaves_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "definiciones_llave" ADD CONSTRAINT "definiciones_llave_llaveCompetenciaId_fkey" FOREIGN KEY ("llaveCompetenciaId") REFERENCES "llaves_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "definiciones_llave" ADD CONSTRAINT "definiciones_llave_participacionLocalId_fkey" FOREIGN KEY ("participacionLocalId") REFERENCES "equipo_participacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "definiciones_llave" ADD CONSTRAINT "definiciones_llave_participacionVisitanteId_fkey" FOREIGN KEY ("participacionVisitanteId") REFERENCES "equipo_participacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "definiciones_llave" ADD CONSTRAINT "definiciones_llave_ganadorParticipacionId_fkey" FOREIGN KEY ("ganadorParticipacionId") REFERENCES "equipo_participacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "definiciones_llave" ADD CONSTRAINT "definiciones_llave_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
