-- AlterTable
ALTER TABLE "partidos" ADD COLUMN     "arbitro" TEXT,
ADD COLUMN     "publicada" BOOLEAN NOT NULL DEFAULT false;

