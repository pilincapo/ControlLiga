-- AlterEnum
BEGIN;
CREATE TYPE "RolCodigo_new" AS ENUM ('SUPERADMIN', 'ADMINISTRADOR', 'DELEGADO_TECNICO', 'JUGADOR');
ALTER TABLE "roles" ALTER COLUMN "codigo" TYPE "RolCodigo_new" USING ("codigo"::text::"RolCodigo_new");
ALTER TYPE "RolCodigo" RENAME TO "RolCodigo_old";
ALTER TYPE "RolCodigo_new" RENAME TO "RolCodigo";
DROP TYPE "public"."RolCodigo_old";
COMMIT;

-- CreateTable
CREATE TABLE "sesiones" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_tokenHash_key" ON "sesiones"("tokenHash");

-- CreateIndex
CREATE INDEX "sesiones_usuarioId_idx" ON "sesiones"("usuarioId");

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
