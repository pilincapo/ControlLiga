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
  datos?: { dni?: string; email?: string },
): Promise<{ persona: { id: string }; jugador: { id: string } }> {
  const prisma = getPrisma()
  const persona = await prisma.persona.create({
    data: { nombre, apellido, dni: datos?.dni ?? null, email: datos?.email ?? null },
  })
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

export async function crearTorneo(
  organizacionId: string,
  nombre: string,
  datos?: { estado?: 'BORRADOR' | 'INSCRIPCIONES' | 'ACTIVO' | 'FINALIZADO' | 'ARCHIVADO'; descripcion?: string },
): Promise<{ id: string }> {
  const prisma = getPrisma()
  const torneo = await prisma.torneo.create({
    data: {
      organizacionId,
      nombre,
      descripcion: datos?.descripcion ?? null,
      estado: datos?.estado ?? 'BORRADOR',
    },
  })
  return { id: torneo.id }
}

export async function crearTemporada(
  torneoId: string,
  nombre: string,
  datos?: { estado?: 'BORRADOR' | 'PUBLICADO' | 'EN_CURSO' | 'FINALIZADO' | 'CANCELADO' },
): Promise<{ id: string }> {
  const prisma = getPrisma()
  const temporada = await prisma.temporada.create({
    data: { torneoId, nombre, fechaInicio: new Date(), estado: datos?.estado ?? 'BORRADOR' },
  })
  return { id: temporada.id }
}

export async function crearCategoria(nombre: string): Promise<{ id: string }> {
  const prisma = getPrisma()
  const categoria = await prisma.categoria.create({ data: { nombre } })
  return { id: categoria.id }
}

export async function crearTorneoCategoria(
  torneoId: string,
  temporadaId: string,
  categoriaId: string,
): Promise<{ id: string }> {
  const prisma = getPrisma()
  const tc = await prisma.torneoCategoria.create({
    data: { torneoId, temporadaId, categoriaId },
  })
  await prisma.configuracionCompetencia.create({
    data: { torneoCategoriaId: tc.id },
  })
  return { id: tc.id }
}

export async function crearZona(torneoCategoriaId: string, nombre: string): Promise<{ id: string }> {
  const prisma = getPrisma()
  const zona = await prisma.zona.create({ data: { torneoCategoriaId, nombre } })
  return { id: zona.id }
}

export async function crearParticipacion(
  torneoId: string,
  temporadaId: string,
  equipoId: string,
  datos?: {
    estado?: 'PENDIENTE' | 'INSCRIPTO' | 'CONFIRMADO' | 'RECHAZADO' | 'BAJA'
    torneoCategoriaId?: string
    zonaId?: string
  },
): Promise<{ id: string }> {
  const prisma = getPrisma()
  const participacion = await prisma.equipoParticipacion.create({
    data: {
      torneoId,
      temporadaId,
      equipoId,
      estado: datos?.estado ?? 'CONFIRMADO',
      torneoCategoriaId: datos?.torneoCategoriaId ?? null,
      zonaId: datos?.zonaId ?? null,
    },
  })
  return { id: participacion.id }
}

export async function crearJugadorParticipacion(
  equipoParticipacionId: string,
  jugadorId: string,
  dorsal?: number,
): Promise<{ id: string }> {
  const prisma = getPrisma()
  const jp = await prisma.jugadorParticipacion.create({
    data: { equipoParticipacionId, jugadorId, dorsal: dorsal ?? null },
  })
  return { id: jp.id }
}

export async function crearPartido(equipoId: string, datos?: { tipo?: 'OFICIAL' | 'AMISTOSO' | 'ENTRENAMIENTO' | 'INTERNO' | 'INFORMAL' | 'OTRO' }): Promise<{ id: string }> {
  const prisma = getPrisma()
  const partido = await prisma.partido.create({
    data: {
      tipo: datos?.tipo ?? 'AMISTOSO',
      equipoResponsableId: equipoId,
      equipoLocalId: equipoId,
      fechaHora: new Date(),
    },
  })
  return { id: partido.id }
}
