-- CreateEnum
CREATE TYPE "EstadoInvitacion" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'EXPIRADA', 'REVOCADA');

-- CreateEnum
CREATE TYPE "TipoInvitacion" AS ENUM ('JUGADOR', 'CUERPO_TECNICO');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('INVITACION_JUGADOR', 'INVITACION_CUERPO_TECNICO', 'INVITACION_TORNEO', 'SOLICITUD_TORNEO', 'RESPUESTA_INVITACION', 'CONVOCATORIA', 'PARTIDO', 'FIXTURE', 'SANCION', 'EQUIPO');

-- AlterTable
ALTER TABLE "equipo_jugador" ADD COLUMN     "invitacionId" UUID;

-- CreateTable
CREATE TABLE "invitaciones" (
    "id" UUID NOT NULL,
    "tipo" "TipoInvitacion" NOT NULL,
    "equipoId" UUID NOT NULL,
    "jugadorId" UUID,
    "usuarioId" UUID,
    "rolEnEquipo" "RolEnEquipo",
    "estado" "EstadoInvitacion" NOT NULL DEFAULT 'PENDIENTE',
    "mensaje" TEXT,
    "expiraEn" TIMESTAMP(3),
    "creadoPorId" UUID,
    "respondidoEn" TIMESTAMP(3),
    "decididoPorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "entidadTipo" TEXT,
    "entidadId" TEXT,
    "leidaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invitaciones_equipoId_estado_idx" ON "invitaciones"("equipoId", "estado");

-- CreateIndex
CREATE INDEX "invitaciones_usuarioId_estado_idx" ON "invitaciones"("usuarioId", "estado");

-- CreateIndex
CREATE INDEX "invitaciones_jugadorId_estado_idx" ON "invitaciones"("jugadorId", "estado");

-- CreateIndex
CREATE INDEX "notificaciones_usuarioId_leidaAt_createdAt_idx" ON "notificaciones"("usuarioId", "leidaAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "equipo_jugador_invitacionId_key" ON "equipo_jugador"("invitacionId");

-- AddForeignKey
ALTER TABLE "equipo_jugador" ADD CONSTRAINT "equipo_jugador_invitacionId_fkey" FOREIGN KEY ("invitacionId") REFERENCES "invitaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_jugadorId_fkey" FOREIGN KEY ("jugadorId") REFERENCES "jugadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
