-- CreateEnum
CREATE TYPE "EstadoTorneo" AS ENUM ('BORRADOR', 'INSCRIPCIONES', 'ACTIVO', 'FINALIZADO', 'ARCHIVADO');

-- CreateEnum
CREATE TYPE "FormatoCompetencia" AS ENUM ('TODOS_CONTRA_TODOS', 'UNA_RUEDA', 'DOS_RUEDAS', 'FASE_DE_GRUPOS', 'GRUPOS_PLAYOFFS', 'ELIMINACION_DIRECTA', 'LIGA_FASE_FINAL', 'FASE_REGULAR_PLAYOFFS');

-- CreateEnum
CREATE TYPE "EstadoJornada" AS ENUM ('PENDIENTE', 'EN_CURSO', 'FINALIZADA', 'CANCELADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoParticipacion" ADD VALUE 'PENDIENTE';
ALTER TYPE "EstadoParticipacion" ADD VALUE 'RECHAZADO';

-- DropForeignKey
ALTER TABLE "torneos" DROP CONSTRAINT "torneos_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "zonas" DROP CONSTRAINT "zonas_torneoId_fkey";

-- DropIndex
DROP INDEX "equipo_participacion_equipoId_torneoId_temporadaId_key";

-- AlterTable
ALTER TABLE "equipo_participacion" ADD COLUMN     "fechaBaja" TIMESTAMP(3),
ADD COLUMN     "invitadoPorId" UUID;

-- AlterTable
ALTER TABLE "partidos" ADD COLUMN     "jornadaId" UUID;

-- AlterTable
ALTER TABLE "torneos" DROP COLUMN "activo",
ADD COLUMN     "configuracionPublica" JSONB,
ADD COLUMN     "estado" "EstadoTorneo" NOT NULL DEFAULT 'BORRADOR',
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "reglas" TEXT,
ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "zonas" DROP COLUMN "torneoId";

-- CreateTable
CREATE TABLE "jugador_participacion" (
    "id" UUID NOT NULL,
    "equipoParticipacionId" UUID NOT NULL,
    "jugadorId" UUID NOT NULL,
    "dorsal" INTEGER,
    "fechaAlta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaBaja" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "jugador_participacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_competencia" (
    "id" UUID NOT NULL,
    "torneoCategoriaId" UUID NOT NULL,
    "formato" "FormatoCompetencia" NOT NULL DEFAULT 'TODOS_CONTRA_TODOS',
    "configuracionFormato" JSONB,
    "sistemaPuntos" JSONB NOT NULL DEFAULT '{"victoria":3,"empate":1,"derrota":0}',
    "desempates" JSONB NOT NULL DEFAULT '["PUNTOS","DIFERENCIA_GOLES","GOLES_FAVOR"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_competencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jornadas" (
    "id" UUID NOT NULL,
    "torneoCategoriaId" UUID NOT NULL,
    "zonaId" UUID,
    "numero" INTEGER NOT NULL,
    "nombre" TEXT,
    "fechaInicio" TIMESTAMP(3),
    "estado" "EstadoJornada" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jornadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jornada_equipo_descanso" (
    "id" UUID NOT NULL,
    "jornadaId" UUID NOT NULL,
    "equipoId" UUID NOT NULL,
    "motivo" TEXT,

    CONSTRAINT "jornada_equipo_descanso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jugador_participacion_equipoParticipacionId_activo_idx" ON "jugador_participacion"("equipoParticipacionId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "jugador_participacion_jugadorId_equipoParticipacionId_key" ON "jugador_participacion"("jugadorId", "equipoParticipacionId");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_competencia_torneoCategoriaId_key" ON "configuracion_competencia"("torneoCategoriaId");

-- CreateIndex
CREATE INDEX "jornadas_torneoCategoriaId_idx" ON "jornadas"("torneoCategoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "jornada_equipo_descanso_jornadaId_equipoId_key" ON "jornada_equipo_descanso"("jornadaId", "equipoId");

-- CreateIndex
CREATE INDEX "equipo_participacion_equipoId_torneoId_temporadaId_idx" ON "equipo_participacion"("equipoId", "torneoId", "temporadaId");

-- CreateIndex
CREATE INDEX "partidos_jornadaId_idx" ON "partidos"("jornadaId");

-- AddForeignKey
ALTER TABLE "torneos" ADD CONSTRAINT "torneos_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_participacion" ADD CONSTRAINT "equipo_participacion_invitadoPorId_fkey" FOREIGN KEY ("invitadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jugador_participacion" ADD CONSTRAINT "jugador_participacion_equipoParticipacionId_fkey" FOREIGN KEY ("equipoParticipacionId") REFERENCES "equipo_participacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jugador_participacion" ADD CONSTRAINT "jugador_participacion_jugadorId_fkey" FOREIGN KEY ("jugadorId") REFERENCES "jugadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_competencia" ADD CONSTRAINT "configuracion_competencia_torneoCategoriaId_fkey" FOREIGN KEY ("torneoCategoriaId") REFERENCES "torneo_categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornadas" ADD CONSTRAINT "jornadas_torneoCategoriaId_fkey" FOREIGN KEY ("torneoCategoriaId") REFERENCES "torneo_categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornadas" ADD CONSTRAINT "jornadas_zonaId_fkey" FOREIGN KEY ("zonaId") REFERENCES "zonas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornada_equipo_descanso" ADD CONSTRAINT "jornada_equipo_descanso_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "jornadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornada_equipo_descanso" ADD CONSTRAINT "jornada_equipo_descanso_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "jornadas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

