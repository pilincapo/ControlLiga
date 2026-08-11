-- CreateEnum
CREATE TYPE "TipoEventoPartido" AS ENUM ('GOL', 'ASISTENCIA', 'TARJETA', 'SUSTITUCION');

-- CreateTable
CREATE TABLE "eventos_partido" (
    "id" UUID NOT NULL,
    "partidoId" UUID NOT NULL,
    "equipoId" UUID NOT NULL,
    "jugadorId" UUID,
    "jugadorRelacionadoId" UUID,
    "tipo" "TipoEventoPartido" NOT NULL,
    "minuto" INTEGER,
    "periodo" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "subtipo" TEXT,
    "observaciones" TEXT,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "creadoPorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eventos_partido_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "eventos_partido" ADD CONSTRAINT "eventos_partido_partidoId_fkey" FOREIGN KEY ("partidoId") REFERENCES "partidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "eventos_partido" ADD CONSTRAINT "eventos_partido_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "eventos_partido" ADD CONSTRAINT "eventos_partido_jugadorId_fkey" FOREIGN KEY ("jugadorId") REFERENCES "jugadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "eventos_partido" ADD CONSTRAINT "eventos_partido_jugadorRelacionadoId_fkey" FOREIGN KEY ("jugadorRelacionadoId") REFERENCES "jugadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "eventos_partido" ADD CONSTRAINT "eventos_partido_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "eventos_partido_partidoId_minuto_orden_idx" ON "eventos_partido"("partidoId", "minuto", "orden");
CREATE INDEX "eventos_partido_jugadorId_tipo_idx" ON "eventos_partido"("jugadorId", "tipo");
CREATE INDEX "eventos_partido_equipoId_tipo_idx" ON "eventos_partido"("equipoId", "tipo");
