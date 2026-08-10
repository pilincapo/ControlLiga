-- AlterTable
ALTER TABLE "convocatoria_jugador" ADD COLUMN     "orden" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "convocatorias" ADD COLUMN     "cancelada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fechaLimite" TIMESTAMP(3),
ADD COLUMN     "publicada" BOOLEAN NOT NULL DEFAULT false;

