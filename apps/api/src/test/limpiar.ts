import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

export const TEST_DB = 'controlliga_test'
export const TEST_URL =
  process.env.DATABASE_URL_TEST ??
  `postgresql://controlliga:controlliga_dev@localhost:5432/${TEST_DB}?schema=public`

export async function limpiarBase(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_URL }) })
  try {
    await prisma.$transaction([
      prisma.auditoriaLog.deleteMany(),
      prisma.session.deleteMany(),
      prisma.rolUsuario.deleteMany(),
      prisma.convocatoriaJugador.deleteMany(),
      prisma.formacionJugador.deleteMany(),
      prisma.movimientoCaja.deleteMany(),
      prisma.sancion.deleteMany(),
      prisma.equipoUsuario.deleteMany(),
      prisma.equipoJugador.deleteMany(),
      prisma.equipoParticipacion.deleteMany(),
      prisma.convocatoria.deleteMany(),
      prisma.formacion.deleteMany(),
      prisma.partido.deleteMany(),
      prisma.equipo.deleteMany(),
      prisma.usuario.deleteMany(),
      prisma.jugador.deleteMany(),
      prisma.persona.deleteMany(),
      prisma.zona.deleteMany(),
      prisma.torneoCategoria.deleteMany(),
      prisma.temporada.deleteMany(),
      prisma.categoria.deleteMany(),
      prisma.torneo.deleteMany(),
      prisma.organizacion.deleteMany(),
    ])
  } finally {
    await prisma.$disconnect()
  }
}
