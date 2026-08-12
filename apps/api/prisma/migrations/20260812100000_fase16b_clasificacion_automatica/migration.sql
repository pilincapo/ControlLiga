CREATE TYPE "TipoReglaClasificacion" AS ENUM ('POSICION_GRUPO', 'MEJORES_ENTRE_GRUPOS', 'POSICION_GENERAL');
CREATE TYPE "EstadoReglaClasificacion" AS ENUM ('BORRADOR', 'CLASIFICADA', 'INVALIDADA', 'BLOQUEADA');
CREATE TYPE "TipoSeedClasificacion" AS ENUM ('ORDEN_CLASIFICACION', 'CRUCE_EXPLICITO');

CREATE TABLE "reglas_clasificacion_fase" (
  "id" UUID NOT NULL, "faseOrigenId" UUID NOT NULL, "faseDestinoId" UUID NOT NULL, "orden" INTEGER NOT NULL, "tipo" "TipoReglaClasificacion" NOT NULL, "posicionDesde" INTEGER NOT NULL, "posicionHasta" INTEGER NOT NULL, "cantidad" INTEGER, "grupoCompetenciaId" UUID, "seedTipo" "TipoSeedClasificacion" NOT NULL, "seedInicio" INTEGER NOT NULL, "configuracion" JSONB NOT NULL, "estado" "EstadoReglaClasificacion" NOT NULL DEFAULT 'BORRADOR', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "reglas_clasificacion_fase_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "clasificados_fase" (
  "id" UUID NOT NULL, "reglaClasificacionId" UUID NOT NULL, "participacionId" UUID NOT NULL, "posicion" INTEGER NOT NULL, "seed" INTEGER NOT NULL, "etiquetaOrigen" TEXT NOT NULL, "tablaSnapshot" JSONB NOT NULL, "desempatesSnapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "clasificados_fase_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "participantes_fase" (
  "id" UUID NOT NULL, "faseCompetenciaId" UUID NOT NULL, "participacionId" UUID NOT NULL, "clasificadoOrigenId" UUID, "seed" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "participantes_fase_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "llaves_competencia" ADD COLUMN "participanteFaseLocalId" UUID, ADD COLUMN "participanteFaseVisitanteId" UUID;
ALTER TABLE "jornadas" ADD COLUMN "faseCompetenciaId" UUID;
CREATE UNIQUE INDEX "reglas_clasificacion_fase_faseDestinoId_orden_key" ON "reglas_clasificacion_fase"("faseDestinoId", "orden");
CREATE INDEX "reglas_clasificacion_fase_faseOrigenId_estado_idx" ON "reglas_clasificacion_fase"("faseOrigenId", "estado");
CREATE INDEX "reglas_clasificacion_fase_faseDestinoId_estado_idx" ON "reglas_clasificacion_fase"("faseDestinoId", "estado");
CREATE INDEX "reglas_clasificacion_fase_grupoCompetenciaId_idx" ON "reglas_clasificacion_fase"("grupoCompetenciaId");
CREATE UNIQUE INDEX "clasificados_fase_reglaClasificacionId_participacionId_key" ON "clasificados_fase"("reglaClasificacionId", "participacionId");
CREATE UNIQUE INDEX "clasificados_fase_reglaClasificacionId_posicion_key" ON "clasificados_fase"("reglaClasificacionId", "posicion");
CREATE UNIQUE INDEX "clasificados_fase_reglaClasificacionId_seed_key" ON "clasificados_fase"("reglaClasificacionId", "seed");
CREATE INDEX "clasificados_fase_participacionId_idx" ON "clasificados_fase"("participacionId");
CREATE UNIQUE INDEX "participantes_fase_clasificadoOrigenId_key" ON "participantes_fase"("clasificadoOrigenId");
CREATE UNIQUE INDEX "participantes_fase_faseCompetenciaId_participacionId_key" ON "participantes_fase"("faseCompetenciaId", "participacionId");
CREATE UNIQUE INDEX "participantes_fase_faseCompetenciaId_seed_key" ON "participantes_fase"("faseCompetenciaId", "seed");
CREATE INDEX "participantes_fase_participacionId_idx" ON "participantes_fase"("participacionId");
CREATE INDEX "llaves_competencia_participanteFaseLocalId_idx" ON "llaves_competencia"("participanteFaseLocalId");
CREATE INDEX "llaves_competencia_participanteFaseVisitanteId_idx" ON "llaves_competencia"("participanteFaseVisitanteId");
CREATE INDEX "jornadas_faseCompetenciaId_idx" ON "jornadas"("faseCompetenciaId");
ALTER TABLE "reglas_clasificacion_fase" ADD CONSTRAINT "reglas_clasificacion_fase_faseOrigenId_fkey" FOREIGN KEY ("faseOrigenId") REFERENCES "fases_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reglas_clasificacion_fase" ADD CONSTRAINT "reglas_clasificacion_fase_faseDestinoId_fkey" FOREIGN KEY ("faseDestinoId") REFERENCES "fases_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reglas_clasificacion_fase" ADD CONSTRAINT "reglas_clasificacion_fase_grupoCompetenciaId_fkey" FOREIGN KEY ("grupoCompetenciaId") REFERENCES "grupos_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clasificados_fase" ADD CONSTRAINT "clasificados_fase_reglaClasificacionId_fkey" FOREIGN KEY ("reglaClasificacionId") REFERENCES "reglas_clasificacion_fase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clasificados_fase" ADD CONSTRAINT "clasificados_fase_participacionId_fkey" FOREIGN KEY ("participacionId") REFERENCES "equipo_participacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "participantes_fase" ADD CONSTRAINT "participantes_fase_faseCompetenciaId_fkey" FOREIGN KEY ("faseCompetenciaId") REFERENCES "fases_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "participantes_fase" ADD CONSTRAINT "participantes_fase_participacionId_fkey" FOREIGN KEY ("participacionId") REFERENCES "equipo_participacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "participantes_fase" ADD CONSTRAINT "participantes_fase_clasificadoOrigenId_fkey" FOREIGN KEY ("clasificadoOrigenId") REFERENCES "clasificados_fase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "llaves_competencia" ADD CONSTRAINT "llaves_competencia_participanteFaseLocalId_fkey" FOREIGN KEY ("participanteFaseLocalId") REFERENCES "participantes_fase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "llaves_competencia" ADD CONSTRAINT "llaves_competencia_participanteFaseVisitanteId_fkey" FOREIGN KEY ("participanteFaseVisitanteId") REFERENCES "participantes_fase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "jornadas" ADD CONSTRAINT "jornadas_faseCompetenciaId_fkey" FOREIGN KEY ("faseCompetenciaId") REFERENCES "fases_competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
