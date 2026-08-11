import type { TipoNotificacion } from '../generated/prisma/enums.js'
import type { PrismaClient } from '../generated/prisma/client.js'

export type Db = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export interface NotificacionEntrada {
  usuarioId: string
  tipo: TipoNotificacion
  titulo: string
  mensaje: string
  entidadTipo?: string
  entidadId?: string
}

export interface NotificacionObjetivo {
  tipo: TipoNotificacion
  titulo: string
  mensaje: string
  entidadTipo?: string
  entidadId?: string
}

export async function notificarUsuarios(
  db: Db,
  usuarioIds: string[],
  objetivo: NotificacionObjetivo,
  excluirUsuarioId?: string,
): Promise<void> {
  const vistos = new Set<string>()
  for (const usuarioId of usuarioIds) {
    if (!usuarioId || usuarioId === excluirUsuarioId || vistos.has(usuarioId)) {
      continue
    }
    vistos.add(usuarioId)
    await db.notificacion.create({
      data: {
        usuarioId,
        tipo: objetivo.tipo,
        titulo: objetivo.titulo,
        mensaje: objetivo.mensaje,
        entidadTipo: objetivo.entidadTipo ?? null,
        entidadId: objetivo.entidadId ?? null,
      },
    })
  }
}

export async function notificarMiembrosEquipos(
  db: Db,
  equipoIds: string[],
  objetivo: NotificacionObjetivo,
  excluirUsuarioId?: string,
): Promise<void> {
  const filas = await db.equipoUsuario.findMany({
    where: { equipoId: { in: equipoIds }, activo: true },
    select: { usuarioId: true },
  })
  await notificarUsuarios(db, filas.map((f) => f.usuarioId), objetivo, excluirUsuarioId)
}

export async function notificarDelegadosEquipos(
  db: Db,
  equipoIds: string[],
  objetivo: NotificacionObjetivo,
  excluirUsuarioId?: string,
): Promise<void> {
  const filas = await db.equipoUsuario.findMany({
    where: { equipoId: { in: equipoIds }, activo: true, rolEnEquipo: 'DELEGADO' },
    select: { usuarioId: true },
  })
  await notificarUsuarios(db, filas.map((f) => f.usuarioId), objetivo, excluirUsuarioId)
}

export async function notificarJugadoresVinculados(
  db: Db,
  jugadorIds: string[],
  objetivo: NotificacionObjetivo,
  excluirUsuarioId?: string,
): Promise<void> {
  const usuarios = await db.usuario.findMany({
    where: { jugadorId: { in: jugadorIds } },
    select: { id: true },
  })
  await notificarUsuarios(db, usuarios.map((u) => u.id), objetivo, excluirUsuarioId)
}

export async function notificarAdminsTorneo(
  db: Db,
  torneoId: string,
  organizacionId: string,
  objetivo: NotificacionObjetivo,
  excluirUsuarioId?: string,
): Promise<void> {
  const filas = await db.rolUsuario.findMany({
    where: {
      activo: true,
      rol: { codigo: 'ADMINISTRADOR' },
      OR: [{ torneoId }, { organizacionId }],
    },
    select: { usuarioId: true },
  })
  await notificarUsuarios(db, filas.map((f) => f.usuarioId), objetivo, excluirUsuarioId)
}
