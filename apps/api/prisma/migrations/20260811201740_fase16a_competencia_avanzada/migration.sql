-- CreateEnum
CREATE TYPE "TipoFaseCompetencia" AS ENUM ('GRUPOS', 'ELIMINACION_DIRECTA', 'LIGA');

-- CreateEnum
CREATE TYPE "EstadoFaseCompetencia" AS ENUM ('BORRADOR', 'GENERADA', 'EN_CURSO', 'FINALIZADA', 'BLOQUEADA');

-- CreateEnum
CREATE TYPE "EstadoLlaveCompetencia" AS ENUM ('PENDIENTE_PARTICIPANTES', 'PROGRAMADA', 'EN_CURSO', 'PENDIENTE_DEFINICION', 'RESUELTA', 'BYE', 'BLOQUEADA');

-- CreateEnum
CREATE TYPE "TipoOrigenLlave" AS ENUM ('SEED', 'GANADOR_LLAVE', 'PERDEDOR_LLAVE', 'ASIGNACION_ADMINISTRATIVA');

-- CreateEnum
CREATE TYPE "MetodoResolucionLlave" AS ENUM ('RESULTADO_PARTIDO', 'BYE', 'ADMINISTRATIVA');

-- AlterTable
ALTER TABLE "equipo_participacion" ADD COLUMN     "grupoCompetenciaId" UUID;

-- AlterTable
ALTER TABLE "jornadas" ADD COLUMN     "grupoCompetenciaId" UUID;

-- AlterTable
ALTER TABLE "partidos" ADD COLUMN     "llaveCompetenciaId" UUID;

-- CreateTable
CREATE TABLE "fases_competencia" (
    "id" UUID NOT NULL,
    "torneoCategoriaId" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoFaseCompetencia" NOT NULL,
    "estado" "EstadoFaseCompetencia" NOT NULL DEFAULT 'BORRADOR',
    "configuracion" JSONB NOT NULL,
    "sistemaPuntos" JSONB,
    "desempates" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fases_competencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupos_competencia" (
    "id" UUID NOT NULL,
    "faseCompetenciaId" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grupos_competencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rondas_eliminatorias" (
    "id" UUID NOT NULL,
    "faseCompetenciaId" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rondas_eliminatorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llaves_competencia" (
    "id" UUID NOT NULL,
    "rondaEliminatoriaId" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "participacionLocalId" UUID,
    "participacionVisitanteId" UUID,
    "seedLocal" INTEGER,
    "seedVisitante" INTEGER,
    "origenLocalTipo" "TipoOrigenLlave",
    "origenLocalLlaveId" UUID,
    "origenVisitanteTipo" "TipoOrigenLlave",
    "origenVisitanteLlaveId" UUID,
    "llaveSiguienteId" UUID,
    "ladoSiguiente" TEXT,
    "ganadorParticipacionId" UUID,
    "estado" "EstadoLlaveCompetencia" NOT NULL DEFAULT 'PENDIENTE_PARTICIPANTES',
    "metodoResolucion" "MetodoResolucionLlave",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llaves_competencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fases_competencia_torneoCategoriaId_estado_idx" ON "fases_competencia"("torneoCategoriaId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "fases_competencia_torneoCategoriaId_orden_key" ON "fases_competencia"("torneoCategoriaId", "orden");

-- CreateIndex
CREATE INDEX "grupos_competencia_faseCompetenciaId_idx" ON "grupos_competencia"("faseCompetenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "grupos_competencia_faseCompetenciaId_orden_key" ON "grupos_competencia"("faseCompetenciaId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "grupos_competencia_faseCompetenciaId_nombre_key" ON "grupos_competencia"("faseCompetenciaId", "nombre");

-- CreateIndex
CREATE INDEX "rondas_eliminatorias_faseCompetenciaId_idx" ON "rondas_eliminatorias"("faseCompetenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "rondas_eliminatorias_faseCompetenciaId_orden_key" ON "rondas_eliminatorias"("faseCompetenciaId", "orden");

-- CreateIndex
CREATE INDEX "llaves_competencia_rondaEliminatoriaId_estado_idx" ON "llaves_competencia"("rondaEliminatoriaId", "estado");

-- CreateIndex
CREATE INDEX "llaves_competencia_llaveSiguienteId_idx" ON "llaves_competencia"("llaveSiguienteId");

-- CreateIndex
CREATE INDEX "llaves_competencia_participacionLocalId_idx" ON "llaves_competencia"("participacionLocalId");

-- CreateIndex
CREATE INDEX "llaves_competencia_participacionVisitanteId_idx" ON "llaves_competencia"("participacionVisitanteId");

-- CreateIndex
CREATE UNIQUE INDEX "llaves_competencia_rondaEliminatoriaId_orden_key" ON "llaves_competencia"("rondaEliminatoriaId", "orden");

-- CreateIndex
CREATE INDEX "equipo_participacion_grupoCompetenciaId_idx" ON "equipo_participacion"("grupoCompetenciaId");

-- CreateIndex
CREATE INDEX "jornadas_grupoCompetenciaId_idx" ON "jornadas"("grupoCompetenciaId");

-- CreateIndex
CREATE INDEX "partidos_llaveCompetenciaId_idx" ON "partidos"("llaveCompetenciaId");

-- AddForeignKey
ALTER TABLE "equipo_participacion" ADD CONSTRAINT "equipo_participacion_grupoCompetenciaId_fkey" FOREIGN KEY ("grupoCompetenciaId") REFERENCES "grupos_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fases_competencia" ADD CONSTRAINT "fases_competencia_torneoCategoriaId_fkey" FOREIGN KEY ("torneoCategoriaId") REFERENCES "torneo_categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos_competencia" ADD CONSTRAINT "grupos_competencia_faseCompetenciaId_fkey" FOREIGN KEY ("faseCompetenciaId") REFERENCES "fases_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rondas_eliminatorias" ADD CONSTRAINT "rondas_eliminatorias_faseCompetenciaId_fkey" FOREIGN KEY ("faseCompetenciaId") REFERENCES "fases_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llaves_competencia" ADD CONSTRAINT "llaves_competencia_rondaEliminatoriaId_fkey" FOREIGN KEY ("rondaEliminatoriaId") REFERENCES "rondas_eliminatorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llaves_competencia" ADD CONSTRAINT "llaves_competencia_participacionLocalId_fkey" FOREIGN KEY ("participacionLocalId") REFERENCES "equipo_participacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llaves_competencia" ADD CONSTRAINT "llaves_competencia_participacionVisitanteId_fkey" FOREIGN KEY ("participacionVisitanteId") REFERENCES "equipo_participacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llaves_competencia" ADD CONSTRAINT "llaves_competencia_origenLocalLlaveId_fkey" FOREIGN KEY ("origenLocalLlaveId") REFERENCES "llaves_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llaves_competencia" ADD CONSTRAINT "llaves_competencia_origenVisitanteLlaveId_fkey" FOREIGN KEY ("origenVisitanteLlaveId") REFERENCES "llaves_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llaves_competencia" ADD CONSTRAINT "llaves_competencia_llaveSiguienteId_fkey" FOREIGN KEY ("llaveSiguienteId") REFERENCES "llaves_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llaves_competencia" ADD CONSTRAINT "llaves_competencia_ganadorParticipacionId_fkey" FOREIGN KEY ("ganadorParticipacionId") REFERENCES "equipo_participacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornadas" ADD CONSTRAINT "jornadas_grupoCompetenciaId_fkey" FOREIGN KEY ("grupoCompetenciaId") REFERENCES "grupos_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_llaveCompetenciaId_fkey" FOREIGN KEY ("llaveCompetenciaId") REFERENCES "llaves_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
