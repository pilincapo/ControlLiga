-- AlterTable
ALTER TABLE "formacion_jugador" ADD COLUMN     "x" INTEGER,
ADD COLUMN     "y" INTEGER;

-- AlterTable
ALTER TABLE "formaciones" ADD COLUMN     "publicada" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "plantilla_formacion" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "formacionTipo" "TipoFormacion" NOT NULL,
    "esquema" TEXT NOT NULL,
    "descripcion" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plantilla_formacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla_formacion_posicion" (
    "id" UUID NOT NULL,
    "plantillaId" UUID NOT NULL,
    "posicion" TEXT NOT NULL,
    "esTitular" BOOLEAN NOT NULL DEFAULT true,
    "x" INTEGER,
    "y" INTEGER,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "plantilla_formacion_posicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formacion_instancia" (
    "id" UUID NOT NULL,
    "formacionId" UUID,
    "partidoId" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "formacionTipo" "TipoFormacion" NOT NULL,
    "esquema" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formacion_instancia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formacion_instancia_jugador" (
    "id" UUID NOT NULL,
    "formacionInstanciaId" UUID NOT NULL,
    "jugadorId" UUID NOT NULL,
    "nombreSnapshot" TEXT NOT NULL,
    "dorsalSnapshot" INTEGER,
    "posicion" TEXT NOT NULL,
    "esTitular" BOOLEAN NOT NULL DEFAULT false,
    "x" INTEGER,
    "y" INTEGER,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "formacion_instancia_jugador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plantilla_formacion_formacionTipo_idx" ON "plantilla_formacion"("formacionTipo");

-- CreateIndex
CREATE UNIQUE INDEX "plantilla_formacion_posicion_plantillaId_orden_key" ON "plantilla_formacion_posicion"("plantillaId", "orden");

-- CreateIndex
CREATE INDEX "formacion_instancia_partidoId_idx" ON "formacion_instancia"("partidoId");

-- CreateIndex
CREATE UNIQUE INDEX "formacion_instancia_formacionId_partidoId_key" ON "formacion_instancia"("formacionId", "partidoId");

-- CreateIndex
CREATE INDEX "formacion_instancia_jugador_jugadorId_idx" ON "formacion_instancia_jugador"("jugadorId");

-- CreateIndex
CREATE UNIQUE INDEX "formacion_instancia_jugador_formacionInstanciaId_jugadorId_key" ON "formacion_instancia_jugador"("formacionInstanciaId", "jugadorId");

-- CreateIndex
CREATE INDEX "formaciones_partidoId_idx" ON "formaciones"("partidoId");

-- AddForeignKey
ALTER TABLE "plantilla_formacion_posicion" ADD CONSTRAINT "plantilla_formacion_posicion_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "plantilla_formacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formacion_instancia" ADD CONSTRAINT "formacion_instancia_formacionId_fkey" FOREIGN KEY ("formacionId") REFERENCES "formaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formacion_instancia" ADD CONSTRAINT "formacion_instancia_partidoId_fkey" FOREIGN KEY ("partidoId") REFERENCES "partidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formacion_instancia_jugador" ADD CONSTRAINT "formacion_instancia_jugador_formacionInstanciaId_fkey" FOREIGN KEY ("formacionInstanciaId") REFERENCES "formacion_instancia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formacion_instancia_jugador" ADD CONSTRAINT "formacion_instancia_jugador_jugadorId_fkey" FOREIGN KEY ("jugadorId") REFERENCES "jugadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

