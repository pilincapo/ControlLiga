-- CreateEnum
CREATE TYPE "EstadoEquipo" AS ENUM ('ACTIVO', 'INACTIVO', 'ARCHIVADO');

-- CreateEnum
CREATE TYPE "EstadoEquipoJugador" AS ENUM ('ACTIVO', 'INACTIVO', 'LESIONADO', 'SUSPENDIDO', 'INVITADO', 'BAJA');

-- DropIndex
DROP INDEX "equipo_jugador_equipoId_activo_idx";

-- DropIndex
DROP INDEX "equipo_jugador_jugadorId_activo_idx";

-- AlterTable
ALTER TABLE "equipo_jugador" DROP COLUMN "activo",
ADD COLUMN     "estado" "EstadoEquipoJugador" NOT NULL DEFAULT 'ACTIVO',
ADD COLUMN     "observaciones" TEXT;

-- AlterTable
ALTER TABLE "equipo_usuario" ADD COLUMN     "fechaBaja" TIMESTAMP(3),
ADD COLUMN     "invitadoPorId" UUID;

-- AlterTable
ALTER TABLE "equipos" ADD COLUMN     "categoriaHabitual" TEXT,
ADD COLUMN     "configuracionPublica" JSONB,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "estado" "EstadoEquipo" NOT NULL DEFAULT 'ACTIVO',
ADD COLUMN     "telefono" TEXT;

-- CreateIndex
CREATE INDEX "equipo_jugador_equipoId_estado_idx" ON "equipo_jugador"("equipoId", "estado");

-- CreateIndex
CREATE INDEX "equipo_jugador_jugadorId_estado_idx" ON "equipo_jugador"("jugadorId", "estado");

-- AddForeignKey
ALTER TABLE "equipo_usuario" ADD CONSTRAINT "equipo_usuario_invitadoPorId_fkey" FOREIGN KEY ("invitadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

