import type { FastifyInstance } from 'fastify'
import { ROLES_POR_EQUIPO } from '@controlliga/shared'
import type { RolEnEquipo } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth, requiereRolEnEquipo } from '../plugins/auth.js'
import { esMiembroEquipo, esSuperadmin, puedeEnEquipo } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import { EstadoEquipoJugador, EstadoInvitacion, TipoInvitacion } from '../generated/prisma/enums.js'
import { expirada, marcarExpiradasLazy, ttlInvitacionMs } from '../invitaciones/servicio.js'
import { notificarJugadoresVinculados, notificarUsuarios } from '../notificaciones/servicio.js'

interface InvitarJugadorBody {
  jugadorId?: string
  persona?: { nombre?: string; apellido?: string; dni?: string }
  mensaje?: string
}

interface InvitarCuerpoBody {
  email?: string
  rolEnEquipo?: string
  mensaje?: string
}

interface ResponderBody {
  aceptar: boolean
}

async function cargarInvitacion(id: string) {
  return getPrisma().invitacion.findUnique({
    where: { id },
    include: {
      equipo: { select: { id: true, nombre: true } },
      jugador: { select: { id: true, persona: { select: { nombre: true, apellido: true } } } },
      usuario: { select: { id: true, nombre: true, apellido: true } },
    },
  })
}

export async function invitacionesRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/equipos/:id/invitaciones-jugador',
    { preHandler: requiereRolEnEquipo('DELEGADO', 'TECNICO') },
    async (request) => {
      const auth = getAuth(request)
      const { id } = request.params as { id: string }
      const body = request.body as InvitarJugadorBody
      const prisma = getPrisma()
      const equipo = await prisma.equipo.findUnique({ where: { id }, select: { id: true, nombre: true } })
      if (!equipo) throw noEncontrado('Equipo')

      const tieneJugador = Boolean(body.jugadorId)
      const tienePersona = body.persona !== undefined
      if (tieneJugador === tienePersona) {
        throw badRequest('Se debe indicar el jugador existente o la persona nueva')
      }

      let jugadorId: string
      if (tieneJugador) {
        const jugador = await prisma.jugador.findUnique({ where: { id: body.jugadorId }, select: { id: true } })
        if (!jugador) throw noEncontrado('Jugador')
        jugadorId = jugador.id
        const pendiente = await prisma.invitacion.findFirst({
          where: { equipoId: id, jugadorId, tipo: TipoInvitacion.JUGADOR, estado: EstadoInvitacion.PENDIENTE },
          select: { id: true },
        })
        if (pendiente) throw conflicto('invitacion_pendiente', 'Ya existe una invitación pendiente para ese jugador')
        const activo = await prisma.equipoJugador.findFirst({
          where: { equipoId: id, jugadorId, estado: { not: EstadoEquipoJugador.BAJA } },
          select: { id: true },
        })
        if (activo) throw conflicto('jugador_en_equipo', 'El jugador ya pertenece al equipo')
      } else {
        const persona = body.persona!
        const nombre = persona.nombre?.trim()
        const apellido = persona.apellido?.trim()
        if (!nombre || nombre.length < 2 || !apellido || apellido.length < 2) {
          throw badRequest('Nombre y apellido son obligatorios')
        }
        if (persona.dni?.trim()) {
          const existente = await prisma.persona.findUnique({ where: { dni: persona.dni.trim() }, select: { id: true } })
          if (existente) throw conflicto('persona_duplicada', 'Ya existe una persona con ese DNI')
        }
        const creado = await prisma.$transaction(async (tx) => {
          const p = await tx.persona.create({
            data: { nombre, apellido, dni: persona.dni?.trim() || null },
          })
          const j = await tx.jugador.create({ data: { personaId: p.id } })
          return { jugadorId: j.id }
        })
        jugadorId = creado.jugadorId
        await auditar(prisma, {
          entidad: 'Jugador',
          entidadId: jugadorId,
          accion: 'CREATE',
          usuarioId: auth.usuarioId,
          cambios: { nombre, apellido, equipoId: id, invitado: true },
        })
      }

      const expiraEn = new Date(Date.now() + ttlInvitacionMs())
      const invitacion = await prisma.$transaction(async (tx) => {
        const creada = await tx.invitacion.create({
          data: {
            tipo: TipoInvitacion.JUGADOR,
            equipoId: id,
            jugadorId,
            estado: EstadoInvitacion.PENDIENTE,
            mensaje: body.mensaje?.trim() || null,
            expiraEn,
            creadoPorId: auth.usuarioId,
          },
        })
        const existente = await tx.equipoJugador.findFirst({
          where: { equipoId: id, jugadorId },
          select: { id: true },
        })
        if (existente) {
          await tx.equipoJugador.update({
            where: { id: existente.id },
            data: {
              estado: EstadoEquipoJugador.INVITADO,
              invitacionId: creada.id,
              fechaIngreso: new Date(),
              fechaSalida: null,
              motivoBaja: null,
            },
          })
        } else {
          await tx.equipoJugador.create({
            data: {
              equipoId: id,
              jugadorId,
              estado: EstadoEquipoJugador.INVITADO,
              invitacionId: creada.id,
            },
          })
        }
        await notificarJugadoresVinculados(
          tx,
          [jugadorId],
          {
            tipo: 'INVITACION_JUGADOR',
            titulo: 'Invitación a equipo',
            mensaje: `El equipo ${equipo.nombre} te invitó a sumarte al plantel`,
            entidadTipo: 'Invitacion',
            entidadId: creada.id,
          },
          auth.usuarioId,
        )
        await auditar(tx, {
          entidad: 'Invitacion',
          entidadId: creada.id,
          accion: 'CREATE',
          usuarioId: auth.usuarioId,
          cambios: { tipo: 'JUGADOR', equipoId: id, expiraEn: expiraEn.toISOString() },
        })
        return creada
      })
      return { data: invitacion }
    },
  )

  app.post(
    '/equipos/:id/invitaciones-cuerpo',
    { preHandler: requiereRolEnEquipo('DELEGADO') },
    async (request, reply) => {
      const auth = getAuth(request)
      const { id } = request.params as { id: string }
      const body = request.body as InvitarCuerpoBody
      const prisma = getPrisma()
      const email = body.email?.trim().toLowerCase()
      if (!email) throw badRequest('El email es obligatorio')
      if (!(ROLES_POR_EQUIPO as readonly string[]).includes(body.rolEnEquipo ?? '')) {
        throw badRequest('El rol no es válido')
      }
      const rolEnEquipo = body.rolEnEquipo as RolEnEquipo
      const equipo = await prisma.equipo.findUnique({ where: { id }, select: { id: true, nombre: true } })
      if (!equipo) throw noEncontrado('Equipo')

      const usuario = await prisma.usuario.findUnique({ where: { email }, select: { id: true } })
      if (!usuario) {
        return reply.status(202).send({ data: { mensaje: 'Si existe una cuenta elegible, recibirá una invitación' } })
      }
      const activo = await prisma.equipoUsuario.findFirst({
        where: { equipoId: id, usuarioId: usuario.id, activo: true },
        select: { id: true },
      })
      if (activo) {
        return reply.status(202).send({ data: { mensaje: 'Si existe una cuenta elegible, recibirá una invitación' } })
      }
      const pendiente = await prisma.invitacion.findFirst({
        where: { equipoId: id, usuarioId: usuario.id, tipo: TipoInvitacion.CUERPO_TECNICO, estado: EstadoInvitacion.PENDIENTE },
        select: { id: true },
      })
      if (pendiente) {
        return reply.status(202).send({ data: { mensaje: 'Si existe una cuenta elegible, recibirá una invitación' } })
      }

      const expiraEn = new Date(Date.now() + ttlInvitacionMs())
      await prisma.$transaction(async (tx) => {
        const creada = await tx.invitacion.create({
          data: {
            tipo: TipoInvitacion.CUERPO_TECNICO,
            equipoId: id,
            usuarioId: usuario.id,
            rolEnEquipo,
            estado: EstadoInvitacion.PENDIENTE,
            mensaje: body.mensaje?.trim() || null,
            expiraEn,
            creadoPorId: auth.usuarioId,
          },
        })
        await notificarUsuarios(
          tx,
          [usuario.id],
          {
            tipo: 'INVITACION_CUERPO_TECNICO',
            titulo: 'Invitación al cuerpo técnico',
            mensaje: `El equipo ${equipo.nombre} te invitó como ${rolEnEquipo}`,
            entidadTipo: 'Invitacion',
            entidadId: creada.id,
          },
          auth.usuarioId,
        )
        await auditar(tx, {
          entidad: 'Invitacion',
          entidadId: creada.id,
          accion: 'CREATE',
          usuarioId: auth.usuarioId,
          cambios: { tipo: 'CUERPO_TECNICO', equipoId: id, rol: rolEnEquipo, expiraEn: expiraEn.toISOString() },
        })
        return creada
      })
      return reply.status(202).send({ data: { mensaje: 'Si existe una cuenta elegible, recibirá una invitación' } })
    },
  )

  app.get('/equipos/:id/invitaciones', { preHandler: autenticar }, async (request, reply) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    if (!(await esMiembroEquipo(prisma, auth, id))) {
      return reply.status(403).send(prohibido('No tenés acceso a ese equipo'))
    }
    const esDelegado = esSuperadmin(auth) || (await puedeEnEquipo(prisma, auth, id, 'DELEGADO'))
    const where = esDelegado ? { equipoId: id } : { equipoId: id, estado: EstadoInvitacion.ACEPTADA }
    const invitaciones = await prisma.invitacion.findMany({
      where,
      include: {
        jugador: { select: { id: true, persona: { select: { nombre: true, apellido: true } } } },
        usuario: { select: { id: true, nombre: true, apellido: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    await prisma.$transaction(async (tx) => {
      await marcarExpiradasLazy(tx, invitaciones)
    })
    return {
      data: invitaciones.map((inv) => ({
        id: inv.id,
        tipo: inv.tipo,
        estado: inv.estado,
        rolEnEquipo: inv.rolEnEquipo,
        mensaje: inv.mensaje,
        expiraEn: inv.expiraEn,
        respondidoEn: inv.respondidoEn,
        createdAt: inv.createdAt,
        destinatario:
          inv.tipo === TipoInvitacion.JUGADOR
            ? { nombre: inv.jugador?.persona.nombre ?? null, apellido: inv.jugador?.persona.apellido ?? null }
            : { nombre: inv.usuario?.nombre ?? null, apellido: inv.usuario?.apellido ?? null },
      })),
    }
  })

  app.post('/invitaciones/:id/responder', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as ResponderBody
    const prisma = getPrisma()
    const invitacion = await cargarInvitacion(id)
    if (!invitacion) throw noEncontrado('Invitación')
    if (invitacion.tipo === TipoInvitacion.JUGADOR) {
      if (invitacion.jugadorId !== auth.jugadorId) {
        throw prohibido('Solo el jugador destinatario puede responder esta invitación')
      }
    } else {
      if (invitacion.usuarioId !== auth.usuarioId) {
        throw prohibido('Solo el usuario destinatario puede responder esta invitación')
      }
    }
    if (invitacion.estado !== EstadoInvitacion.PENDIENTE) {
      throw conflicto(
        invitacion.estado === EstadoInvitacion.EXPIRADA ? 'invitacion_expirada' : 'estado_invalido',
        'La invitación ya fue resuelta',
      )
    }
    if (expirada(invitacion)) {
      await prisma.$transaction(async (tx) => {
        await marcarExpiradasLazy(tx, [invitacion])
      })
      throw conflicto('invitacion_expirada', 'La invitación expiró')
    }

    const acepta = body.aceptar === true
    const actualizada = await prisma.$transaction(async (tx) => {
      const resuelta = await tx.invitacion.update({
        where: { id },
        data: {
          estado: acepta ? EstadoInvitacion.ACEPTADA : EstadoInvitacion.RECHAZADA,
          respondidoEn: new Date(),
          decididoPorId: auth.usuarioId,
        },
      })
      if (invitacion.tipo === TipoInvitacion.JUGADOR) {
        const ej = await tx.equipoJugador.findFirst({
          where: { equipoId: invitacion.equipoId, jugadorId: invitacion.jugadorId!, invitacionId: id },
          select: { id: true },
        })
        if (ej) {
          await tx.equipoJugador.update({
            where: { id: ej.id },
            data: acepta
              ? { estado: EstadoEquipoJugador.ACTIVO, fechaIngreso: new Date() }
              : { estado: EstadoEquipoJugador.BAJA, fechaSalida: new Date(), motivoBaja: 'invitación rechazada' },
          })
        }
      } else if (acepta) {
        const existente = await tx.equipoUsuario.findFirst({
          where: { equipoId: invitacion.equipoId, usuarioId: invitacion.usuarioId! },
          select: { id: true },
        })
        if (existente) {
          await tx.equipoUsuario.update({
            where: { id: existente.id },
            data: {
              activo: true,
              fechaBaja: null,
              rolEnEquipo: invitacion.rolEnEquipo!,
              invitadoPorId: invitacion.creadoPorId,
            },
          })
        } else {
          await tx.equipoUsuario.create({
            data: {
              equipoId: invitacion.equipoId,
              usuarioId: invitacion.usuarioId!,
              rolEnEquipo: invitacion.rolEnEquipo!,
              invitadoPorId: invitacion.creadoPorId,
            },
          })
        }
      }
      if (invitacion.creadoPorId) {
        await notificarUsuarios(
          tx,
          [invitacion.creadoPorId],
          {
            tipo: 'RESPUESTA_INVITACION',
            titulo: 'Respuesta de invitación',
            mensaje: `${auth.nombre} ${auth.apellido} ${acepta ? 'aceptó' : 'rechazó'} la invitación al equipo ${invitacion.equipo.nombre}`,
            entidadTipo: 'Invitacion',
            entidadId: id,
          },
          auth.usuarioId,
        )
      }
      await auditar(tx, {
        entidad: 'Invitacion',
        entidadId: id,
        accion: 'UPDATE',
        usuarioId: auth.usuarioId,
        cambios: { estadoResultante: acepta ? 'ACEPTADA' : 'RECHAZADA', respondidoEn: true },
      })
      return resuelta
    })
    return { data: actualizada }
  })

  app.post('/invitaciones/:id/revocar', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const invitacion = await cargarInvitacion(id)
    if (!invitacion) throw noEncontrado('Invitación')
    const esEmisor = invitacion.creadoPorId === auth.usuarioId
    const esDelegado = esSuperadmin(auth) || (await puedeEnEquipo(prisma, auth, invitacion.equipoId, 'DELEGADO'))
    if (!esEmisor && !esDelegado) {
      throw prohibido('No tenés permiso para revocar esa invitación')
    }
    if (invitacion.estado !== EstadoInvitacion.PENDIENTE) {
      throw conflicto(
        invitacion.estado === EstadoInvitacion.EXPIRADA ? 'invitacion_expirada' : 'estado_invalido',
        'La invitación ya fue resuelta',
      )
    }
    if (expirada(invitacion)) {
      await prisma.$transaction(async (tx) => {
        await marcarExpiradasLazy(tx, [invitacion])
      })
      throw conflicto('invitacion_expirada', 'La invitación expiró')
    }
    const actualizada = await prisma.$transaction(async (tx) => {
      const revocada = await tx.invitacion.update({
        where: { id },
        data: { estado: EstadoInvitacion.REVOCADA, respondidoEn: new Date(), decididoPorId: auth.usuarioId },
      })
      if (invitacion.tipo === TipoInvitacion.JUGADOR && invitacion.jugadorId) {
        const ej = await tx.equipoJugador.findFirst({
          where: { equipoId: invitacion.equipoId, jugadorId: invitacion.jugadorId, invitacionId: id },
          select: { id: true },
        })
        if (ej) {
          await tx.equipoJugador.update({
            where: { id: ej.id },
            data: { estado: EstadoEquipoJugador.BAJA, fechaSalida: new Date(), motivoBaja: 'invitación revocada' },
          })
        }
      }
      await auditar(tx, {
        entidad: 'Invitacion',
        entidadId: id,
        accion: 'UPDATE',
        usuarioId: auth.usuarioId,
        cambios: { estadoResultante: 'REVOCADA' },
      })
      return revocada
    })
    return { data: actualizada }
  })

  app.get('/invitaciones/mias', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const prisma = getPrisma()
    const where = [
      ...(auth.jugadorId ? [{ jugadorId: auth.jugadorId } as const] : []),
      { usuarioId: auth.usuarioId } as const,
    ]
    const invitaciones = await prisma.invitacion.findMany({
      where: { OR: where },
      include: { equipo: { select: { id: true, nombre: true, escudoUrl: true } } },
      orderBy: { createdAt: 'desc' },
    })
    await prisma.$transaction(async (tx) => {
      await marcarExpiradasLazy(tx, invitaciones)
    })
    return {
      data: invitaciones.map((inv) => ({
        id: inv.id,
        tipo: inv.tipo,
        estado: inv.estado,
        rolEnEquipo: inv.rolEnEquipo,
        mensaje: inv.mensaje,
        expiraEn: inv.expiraEn,
        respondidoEn: inv.respondidoEn,
        createdAt: inv.createdAt,
        equipo: inv.equipo,
      })),
    }
  })
}
