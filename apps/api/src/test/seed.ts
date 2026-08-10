import type { RolCodigo } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { hashPassword } from '../auth/password.js'

export async function asegurarRol(codigo: RolCodigo): Promise<{ id: string }> {
  const prisma = getPrisma()
  return prisma.rol.upsert({
    where: { codigo },
    update: {},
    create: { codigo, nombre: codigo },
  })
}

export async function crearUsuario(datos: {
  email: string
  password?: string
  nombre?: string
  apellido?: string
  jugadorId?: string
  roles?: Array<{ codigo: RolCodigo; organizacionId?: string | null; torneoId?: string | null }>
}): Promise<{ id: string; email: string }> {
  const prisma = getPrisma()
  const rolIds: Array<{ rolId: string; organizacionId: string | null; torneoId: string | null }> = []
  for (const r of datos.roles ?? []) {
    const rol = await asegurarRol(r.codigo)
    rolIds.push({
      rolId: rol.id,
      organizacionId: r.organizacionId ?? null,
      torneoId: r.torneoId ?? null,
    })
  }
  return prisma.usuario.create({
    data: {
      email: datos.email,
      passwordHash: await hashPassword(datos.password ?? 'contraseña123'),
      nombre: datos.nombre ?? 'Test',
      apellido: datos.apellido ?? 'Test',
      jugadorId: datos.jugadorId ?? null,
      roles: rolIds.length > 0 ? { create: rolIds } : undefined,
    },
    select: { id: true, email: true },
  })
}

export async function crearPersonaJugador(
  nombre: string,
  apellido = 'Test',
): Promise<{ persona: { id: string }; jugador: { id: string } }> {
  const prisma = getPrisma()
  const persona = await prisma.persona.create({ data: { nombre, apellido } })
  const jugador = await prisma.jugador.create({ data: { personaId: persona.id } })
  return { persona: { id: persona.id }, jugador: { id: jugador.id } }
}

export async function crearEquipo(nombre: string): Promise<{ id: string }> {
  const prisma = getPrisma()
  const equipo = await prisma.equipo.create({ data: { nombre } })
  return { id: equipo.id }
}

export async function crearOrganizacion(nombre: string): Promise<{ id: string }> {
  const prisma = getPrisma()
  const organizacion = await prisma.organizacion.create({ data: { nombre } })
  return { id: organizacion.id }
}

export async function agregarMiembroEquipo(
  usuarioId: string,
  equipoId: string,
  rolEnEquipo: 'DELEGADO' | 'TECNICO' | 'AUXILIAR',
): Promise<void> {
  const prisma = getPrisma()
  await prisma.equipoUsuario.create({ data: { usuarioId, equipoId, rolEnEquipo } })
}

export async function agregarJugadorAEquipo(jugadorId: string, equipoId: string, dorsal?: number): Promise<void> {
  const prisma = getPrisma()
  await prisma.equipoJugador.create({ data: { jugadorId, equipoId, dorsal: dorsal ?? null } })
}
