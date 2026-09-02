import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

export const TEST_DB = 'controlliga_test'
export const TEST_URL =
  process.env.DATABASE_URL_TEST ??
  `postgresql://controlliga:controlliga_dev@localhost:5432/${TEST_DB}?schema=public`

export async function limpiarBase(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_URL }) })
  try {
    // Prisma's adapter-pg warns when a batch transaction starts concurrent queries.
    // Cleanup only needs FK order, not atomicity, so run deletes sequentially.
    await prisma.auditoriaLog.deleteMany()
    await prisma.passwordResetToken.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolUsuario.deleteMany()
    await prisma.convocatoriaJugador.deleteMany()
    await prisma.formacionJugador.deleteMany()
    await prisma.formacionInstanciaJugador.deleteMany()
    await prisma.formacionInstancia.deleteMany()
    await prisma.movimientoCaja.deleteMany()
    await prisma.sancion.deleteMany()
    await prisma.notificacion.deleteMany()
    await prisma.invitacion.deleteMany()
    await prisma.equipoUsuario.deleteMany()
    await prisma.equipoJugador.deleteMany()
    await prisma.jugadorParticipacion.deleteMany()
    await prisma.jornadaEquipoDescanso.deleteMany()
    await prisma.convocatoria.deleteMany()
    await prisma.formacion.deleteMany()
    await prisma.eventoPartido.deleteMany()
    await prisma.partido.deleteMany()
    await prisma.definicionLlave.deleteMany()
    await prisma.llaveCompetencia.deleteMany()
    await prisma.rondaEliminatoria.deleteMany()
    await prisma.jornada.deleteMany()
    await prisma.participanteFase.deleteMany()
    await prisma.clasificadoFase.deleteMany()
    await prisma.reglaClasificacionFase.deleteMany()
    await prisma.equipoParticipacion.updateMany({ data: { grupoCompetenciaId: null } })
    await prisma.grupoCompetencia.deleteMany()
    await prisma.faseCompetencia.deleteMany()
    await prisma.equipoParticipacion.deleteMany()
    await prisma.equipo.deleteMany()
    await prisma.usuario.deleteMany()
    await prisma.jugador.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.zona.deleteMany()
    await prisma.configuracionCompetencia.deleteMany()
    await prisma.torneoCategoria.deleteMany()
    await prisma.temporada.deleteMany()
    await prisma.categoria.deleteMany()
    await prisma.torneo.deleteMany()
    await prisma.organizacion.deleteMany()
  } finally {
    await prisma.$disconnect()
  }
}
