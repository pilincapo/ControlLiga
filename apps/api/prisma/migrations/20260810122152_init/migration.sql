-- CreateEnum
CREATE TYPE "RolCodigo" AS ENUM ('SUPERADMIN', 'ORGANIZADOR', 'DELEGADO_TECNICO', 'JUGADOR');

-- CreateEnum
CREATE TYPE "RolEnEquipo" AS ENUM ('DELEGADO', 'TECNICO', 'AUXILIAR');

-- CreateEnum
CREATE TYPE "EstadoTemporada" AS ENUM ('BORRADOR', 'PUBLICADO', 'EN_CURSO', 'FINALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoTorneoCategoria" AS ENUM ('ACTIVA', 'CERRADA');

-- CreateEnum
CREATE TYPE "EstadoParticipacion" AS ENUM ('INSCRIPTO', 'CONFIRMADO', 'BAJA');

-- CreateEnum
CREATE TYPE "TipoPartido" AS ENUM ('OFICIAL', 'AMISTOSO', 'ENTRENAMIENTO', 'INTERNO', 'INFORMAL', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoPartido" AS ENUM ('PROGRAMADO', 'EN_CURSO', 'FINALIZADO', 'SUSPENDIDO', 'APLAZADO');

-- CreateEnum
CREATE TYPE "TipoFormacion" AS ENUM ('FUTBOL_5', 'FUTBOL_7', 'FUTBOL_8', 'FUTBOL_9', 'FUTBOL_11', 'PERSONALIZADA');

-- CreateEnum
CREATE TYPE "EstadoConvocado" AS ENUM ('CONFIRMADO', 'PENDIENTE', 'NO_DISPONIBLE', 'AUSENTE');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "CategoriaMovimiento" AS ENUM ('CUOTA', 'APORTE', 'INSCRIPCION', 'OTROS', 'CANCHA', 'ARBITRO', 'EQUIPAMIENTO', 'VIAJE', 'TERCER_TIEMPO');

-- CreateEnum
CREATE TYPE "EstadoMovimiento" AS ENUM ('PENDIENTE', 'PAGADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "OrigenSancion" AS ENUM ('PARTIDO', 'ACUMULACION_TARJETAS', 'ADMINISTRATIVA', 'TRIBUNAL', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoSancion" AS ENUM ('AMARILLA', 'ROJA', 'SUSPENSION', 'APELACION', 'OTRA');

-- CreateEnum
CREATE TYPE "AccionAuditoria" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "jugadorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "codigo" "RolCodigo" NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol_usuario" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "rolId" UUID NOT NULL,
    "organizacionId" UUID,
    "torneoId" UUID,
    "equipoId" UUID,
    "jugadorId" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rol_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personas" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "dni" TEXT,
    "fechaNacimiento" TIMESTAMP(3),
    "email" TEXT,
    "telefono" TEXT,
    "fotoUrl" TEXT,
    "sexo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jugadores" (
    "id" UUID NOT NULL,
    "personaId" UUID NOT NULL,
    "pieDominante" TEXT,
    "posicionFavorita" TEXT,
    "alturaCm" INTEGER,
    "pesoKg" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jugadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipos" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "escudoUrl" TEXT,
    "descripcion" TEXT,
    "colorPrincipal" TEXT,
    "colorSecundario" TEXT,
    "privado" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipo_usuario" (
    "id" UUID NOT NULL,
    "equipoId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "rolEnEquipo" "RolEnEquipo" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipo_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipo_jugador" (
    "id" UUID NOT NULL,
    "equipoId" UUID NOT NULL,
    "jugadorId" UUID NOT NULL,
    "dorsal" INTEGER,
    "posiciones" TEXT,
    "fechaIngreso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaSalida" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "motivoBaja" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipo_jugador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizaciones" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "torneos" (
    "id" UUID NOT NULL,
    "organizacionId" UUID,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "visiblePublico" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "torneos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporadas" (
    "id" UUID NOT NULL,
    "torneoId" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3),
    "estado" "EstadoTemporada" NOT NULL DEFAULT 'BORRADOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "temporadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "torneo_categoria" (
    "id" UUID NOT NULL,
    "torneoId" UUID NOT NULL,
    "temporadaId" UUID NOT NULL,
    "categoriaId" UUID NOT NULL,
    "estado" "EstadoTorneoCategoria" NOT NULL DEFAULT 'ACTIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "torneo_categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zonas" (
    "id" UUID NOT NULL,
    "torneoCategoriaId" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "torneoId" UUID,

    CONSTRAINT "zonas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipo_participacion" (
    "id" UUID NOT NULL,
    "torneoId" UUID NOT NULL,
    "temporadaId" UUID NOT NULL,
    "torneoCategoriaId" UUID,
    "zonaId" UUID,
    "equipoId" UUID NOT NULL,
    "estado" "EstadoParticipacion" NOT NULL DEFAULT 'INSCRIPTO',
    "fechaInscripcion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipo_participacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partidos" (
    "id" UUID NOT NULL,
    "tipo" "TipoPartido" NOT NULL,
    "equipoResponsableId" UUID,
    "torneoId" UUID,
    "temporadaId" UUID,
    "torneoCategoriaId" UUID,
    "zonaId" UUID,
    "equipoLocalId" UUID,
    "equipoVisitanteId" UUID,
    "fechaHora" TIMESTAMP(3) NOT NULL,
    "lugar" TEXT,
    "estado" "EstadoPartido" NOT NULL DEFAULT 'PROGRAMADO',
    "golesLocal" INTEGER,
    "golesVisitante" INTEGER,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanciones" (
    "id" UUID NOT NULL,
    "jugadorId" UUID,
    "equipoId" UUID NOT NULL,
    "origen" "OrigenSancion" NOT NULL,
    "tipo" "TipoSancion" NOT NULL,
    "partidoId" UUID,
    "torneoId" UUID,
    "temporadaId" UUID,
    "torneoCategoriaId" UUID,
    "zonaId" UUID,
    "motivo" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3),
    "resuelta" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sanciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formaciones" (
    "id" UUID NOT NULL,
    "equipoId" UUID NOT NULL,
    "partidoId" UUID,
    "nombre" TEXT NOT NULL,
    "formacionTipo" "TipoFormacion" NOT NULL,
    "esquema" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formacion_jugador" (
    "id" UUID NOT NULL,
    "formacionId" UUID NOT NULL,
    "equipoJugadorId" UUID NOT NULL,
    "posicion" TEXT NOT NULL,
    "esTitular" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "formacion_jugador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convocatorias" (
    "id" UUID NOT NULL,
    "equipoId" UUID NOT NULL,
    "partidoId" UUID,
    "fecha" TIMESTAMP(3) NOT NULL,
    "lugar" TEXT,
    "hora" TEXT,
    "notas" TEXT,
    "creadoPorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "convocatorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convocatoria_jugador" (
    "id" UUID NOT NULL,
    "convocatoriaId" UUID NOT NULL,
    "equipoJugadorId" UUID NOT NULL,
    "estado" "EstadoConvocado" NOT NULL DEFAULT 'PENDIENTE',
    "nota" TEXT,
    "respondioEn" TIMESTAMP(3),

    CONSTRAINT "convocatoria_jugador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_caja" (
    "id" UUID NOT NULL,
    "equipoId" UUID NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "categoria" "CategoriaMovimiento" NOT NULL,
    "concepto" TEXT NOT NULL,
    "importe" DECIMAL(10,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jugadorId" UUID,
    "comprobanteUrl" TEXT,
    "observaciones" TEXT,
    "estado" "EstadoMovimiento" NOT NULL DEFAULT 'PENDIENTE',
    "creadoPorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movimiento_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_log" (
    "id" UUID NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" "AccionAuditoria" NOT NULL,
    "usuarioId" UUID,
    "cambios" JSONB,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_jugadorId_key" ON "usuarios"("jugadorId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_codigo_key" ON "roles"("codigo");

-- CreateIndex
CREATE INDEX "rol_usuario_usuarioId_idx" ON "rol_usuario"("usuarioId");

-- CreateIndex
CREATE INDEX "rol_usuario_rolId_idx" ON "rol_usuario"("rolId");

-- CreateIndex
CREATE INDEX "rol_usuario_organizacionId_idx" ON "rol_usuario"("organizacionId");

-- CreateIndex
CREATE INDEX "rol_usuario_torneoId_idx" ON "rol_usuario"("torneoId");

-- CreateIndex
CREATE INDEX "rol_usuario_equipoId_idx" ON "rol_usuario"("equipoId");

-- CreateIndex
CREATE UNIQUE INDEX "personas_dni_key" ON "personas"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "jugadores_personaId_key" ON "jugadores"("personaId");

-- CreateIndex
CREATE INDEX "equipos_creadoPorId_idx" ON "equipos"("creadoPorId");

-- CreateIndex
CREATE INDEX "equipo_usuario_equipoId_activo_idx" ON "equipo_usuario"("equipoId", "activo");

-- CreateIndex
CREATE INDEX "equipo_usuario_usuarioId_activo_idx" ON "equipo_usuario"("usuarioId", "activo");

-- CreateIndex
CREATE INDEX "equipo_jugador_equipoId_activo_idx" ON "equipo_jugador"("equipoId", "activo");

-- CreateIndex
CREATE INDEX "equipo_jugador_jugadorId_activo_idx" ON "equipo_jugador"("jugadorId", "activo");

-- CreateIndex
CREATE INDEX "torneos_organizacionId_idx" ON "torneos"("organizacionId");

-- CreateIndex
CREATE INDEX "temporadas_torneoId_idx" ON "temporadas"("torneoId");

-- CreateIndex
CREATE INDEX "torneo_categoria_temporadaId_idx" ON "torneo_categoria"("temporadaId");

-- CreateIndex
CREATE UNIQUE INDEX "torneo_categoria_torneoId_temporadaId_categoriaId_key" ON "torneo_categoria"("torneoId", "temporadaId", "categoriaId");

-- CreateIndex
CREATE INDEX "zonas_torneoCategoriaId_idx" ON "zonas"("torneoCategoriaId");

-- CreateIndex
CREATE INDEX "equipo_participacion_torneoId_idx" ON "equipo_participacion"("torneoId");

-- CreateIndex
CREATE INDEX "equipo_participacion_temporadaId_idx" ON "equipo_participacion"("temporadaId");

-- CreateIndex
CREATE INDEX "equipo_participacion_torneoCategoriaId_idx" ON "equipo_participacion"("torneoCategoriaId");

-- CreateIndex
CREATE INDEX "equipo_participacion_zonaId_idx" ON "equipo_participacion"("zonaId");

-- CreateIndex
CREATE UNIQUE INDEX "equipo_participacion_equipoId_torneoId_temporadaId_key" ON "equipo_participacion"("equipoId", "torneoId", "temporadaId");

-- CreateIndex
CREATE INDEX "partidos_equipoLocalId_idx" ON "partidos"("equipoLocalId");

-- CreateIndex
CREATE INDEX "partidos_equipoVisitanteId_idx" ON "partidos"("equipoVisitanteId");

-- CreateIndex
CREATE INDEX "partidos_torneoId_idx" ON "partidos"("torneoId");

-- CreateIndex
CREATE INDEX "partidos_temporadaId_idx" ON "partidos"("temporadaId");

-- CreateIndex
CREATE INDEX "partidos_fechaHora_idx" ON "partidos"("fechaHora");

-- CreateIndex
CREATE INDEX "partidos_equipoResponsableId_tipo_idx" ON "partidos"("equipoResponsableId", "tipo");

-- CreateIndex
CREATE INDEX "sanciones_jugadorId_idx" ON "sanciones"("jugadorId");

-- CreateIndex
CREATE INDEX "sanciones_equipoId_idx" ON "sanciones"("equipoId");

-- CreateIndex
CREATE INDEX "sanciones_torneoId_idx" ON "sanciones"("torneoId");

-- CreateIndex
CREATE INDEX "sanciones_partidoId_idx" ON "sanciones"("partidoId");

-- CreateIndex
CREATE INDEX "formaciones_equipoId_fecha_idx" ON "formaciones"("equipoId", "fecha");

-- CreateIndex
CREATE INDEX "formacion_jugador_equipoJugadorId_idx" ON "formacion_jugador"("equipoJugadorId");

-- CreateIndex
CREATE UNIQUE INDEX "formacion_jugador_formacionId_equipoJugadorId_key" ON "formacion_jugador"("formacionId", "equipoJugadorId");

-- CreateIndex
CREATE INDEX "convocatorias_equipoId_fecha_idx" ON "convocatorias"("equipoId", "fecha");

-- CreateIndex
CREATE INDEX "convocatoria_jugador_equipoJugadorId_idx" ON "convocatoria_jugador"("equipoJugadorId");

-- CreateIndex
CREATE UNIQUE INDEX "convocatoria_jugador_convocatoriaId_equipoJugadorId_key" ON "convocatoria_jugador"("convocatoriaId", "equipoJugadorId");

-- CreateIndex
CREATE INDEX "movimiento_caja_equipoId_fecha_idx" ON "movimiento_caja"("equipoId", "fecha");

-- CreateIndex
CREATE INDEX "movimiento_caja_equipoId_estado_idx" ON "movimiento_caja"("equipoId", "estado");

-- CreateIndex
CREATE INDEX "movimiento_caja_jugadorId_idx" ON "movimiento_caja"("jugadorId");

-- CreateIndex
CREATE INDEX "auditoria_log_entidad_entidadId_idx" ON "auditoria_log"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "auditoria_log_usuarioId_idx" ON "auditoria_log"("usuarioId");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_jugadorId_fkey" FOREIGN KEY ("jugadorId") REFERENCES "jugadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_usuario" ADD CONSTRAINT "rol_usuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_usuario" ADD CONSTRAINT "rol_usuario_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_usuario" ADD CONSTRAINT "rol_usuario_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_usuario" ADD CONSTRAINT "rol_usuario_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_usuario" ADD CONSTRAINT "rol_usuario_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_usuario" ADD CONSTRAINT "rol_usuario_jugadorId_fkey" FOREIGN KEY ("jugadorId") REFERENCES "jugadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jugadores" ADD CONSTRAINT "jugadores_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_usuario" ADD CONSTRAINT "equipo_usuario_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_usuario" ADD CONSTRAINT "equipo_usuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_jugador" ADD CONSTRAINT "equipo_jugador_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_jugador" ADD CONSTRAINT "equipo_jugador_jugadorId_fkey" FOREIGN KEY ("jugadorId") REFERENCES "jugadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "torneos" ADD CONSTRAINT "torneos_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporadas" ADD CONSTRAINT "temporadas_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "torneo_categoria" ADD CONSTRAINT "torneo_categoria_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "torneo_categoria" ADD CONSTRAINT "torneo_categoria_temporadaId_fkey" FOREIGN KEY ("temporadaId") REFERENCES "temporadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "torneo_categoria" ADD CONSTRAINT "torneo_categoria_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zonas" ADD CONSTRAINT "zonas_torneoCategoriaId_fkey" FOREIGN KEY ("torneoCategoriaId") REFERENCES "torneo_categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zonas" ADD CONSTRAINT "zonas_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_participacion" ADD CONSTRAINT "equipo_participacion_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_participacion" ADD CONSTRAINT "equipo_participacion_temporadaId_fkey" FOREIGN KEY ("temporadaId") REFERENCES "temporadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_participacion" ADD CONSTRAINT "equipo_participacion_torneoCategoriaId_fkey" FOREIGN KEY ("torneoCategoriaId") REFERENCES "torneo_categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_participacion" ADD CONSTRAINT "equipo_participacion_zonaId_fkey" FOREIGN KEY ("zonaId") REFERENCES "zonas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_participacion" ADD CONSTRAINT "equipo_participacion_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_equipoResponsableId_fkey" FOREIGN KEY ("equipoResponsableId") REFERENCES "equipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_temporadaId_fkey" FOREIGN KEY ("temporadaId") REFERENCES "temporadas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_torneoCategoriaId_fkey" FOREIGN KEY ("torneoCategoriaId") REFERENCES "torneo_categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_zonaId_fkey" FOREIGN KEY ("zonaId") REFERENCES "zonas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_equipoLocalId_fkey" FOREIGN KEY ("equipoLocalId") REFERENCES "equipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_equipoVisitanteId_fkey" FOREIGN KEY ("equipoVisitanteId") REFERENCES "equipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanciones" ADD CONSTRAINT "sanciones_jugadorId_fkey" FOREIGN KEY ("jugadorId") REFERENCES "jugadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanciones" ADD CONSTRAINT "sanciones_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanciones" ADD CONSTRAINT "sanciones_partidoId_fkey" FOREIGN KEY ("partidoId") REFERENCES "partidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanciones" ADD CONSTRAINT "sanciones_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanciones" ADD CONSTRAINT "sanciones_temporadaId_fkey" FOREIGN KEY ("temporadaId") REFERENCES "temporadas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanciones" ADD CONSTRAINT "sanciones_torneoCategoriaId_fkey" FOREIGN KEY ("torneoCategoriaId") REFERENCES "torneo_categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanciones" ADD CONSTRAINT "sanciones_zonaId_fkey" FOREIGN KEY ("zonaId") REFERENCES "zonas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formaciones" ADD CONSTRAINT "formaciones_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formaciones" ADD CONSTRAINT "formaciones_partidoId_fkey" FOREIGN KEY ("partidoId") REFERENCES "partidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formacion_jugador" ADD CONSTRAINT "formacion_jugador_formacionId_fkey" FOREIGN KEY ("formacionId") REFERENCES "formaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formacion_jugador" ADD CONSTRAINT "formacion_jugador_equipoJugadorId_fkey" FOREIGN KEY ("equipoJugadorId") REFERENCES "equipo_jugador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convocatorias" ADD CONSTRAINT "convocatorias_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convocatorias" ADD CONSTRAINT "convocatorias_partidoId_fkey" FOREIGN KEY ("partidoId") REFERENCES "partidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convocatorias" ADD CONSTRAINT "convocatorias_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convocatoria_jugador" ADD CONSTRAINT "convocatoria_jugador_convocatoriaId_fkey" FOREIGN KEY ("convocatoriaId") REFERENCES "convocatorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convocatoria_jugador" ADD CONSTRAINT "convocatoria_jugador_equipoJugadorId_fkey" FOREIGN KEY ("equipoJugadorId") REFERENCES "equipo_jugador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_jugadorId_fkey" FOREIGN KEY ("jugadorId") REFERENCES "jugadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_log" ADD CONSTRAINT "auditoria_log_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
