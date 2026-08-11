import type { FastifyInstance } from 'fastify'
import { PERMISOS, TIPOS_FORMACION, esTipoFormacion, coordenadasValidas } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth, requierePermiso } from '../plugins/auth.js'
import { esMiembroEquipo, esSuperadmin, puedeEnEquipo } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import { EstadoEquipoJugador } from '../generated/prisma/enums.js'
import type { Prisma } from '../generated/prisma/client.js'
import type { ContextoAuth } from '../auth/contexto.js'
import type { PrismaClient } from '../generated/prisma/client.js'

interface JugadorFormacionBody {
  equipoJugadorId: string
  posicion: string
  esTitular?: boolean
  x?: number
  y?: number
  orden?: number
}

interface CrearFormacionBody {
  equipoId: string
  nombre: string
  formacionTipo?: string
  esquema?: string
  partidoId?: string
  notas?: string
  plantillaId?: string
  jugadores?: JugadorFormacionBody[]
}

interface ModificarFormacionBody {
  nombre?: string
  formacionTipo?: string
  esquema?: string
  notas?: string
  jugadores?: JugadorFormacionBody[]
}

async function validarJugadores(
  prisma: PrismaClient,
  equipoId: string,
  jugadores: JugadorFormacionBody[] | undefined,
): Promise<Array<{ equipoJugadorId: string; posicion: string; esTitular: boolean; x: number | null; y: number | null; orden: number }>> {
  if (!jugadores) {
    return []
  }
  const vistos = new Set<string>()
  const resultado: Array<{ equipoJugadorId: string; posicion: string; esTitular: boolean; x: number | null; y: number | null; orden: number }> = []
  for (const [i, j] of jugadores.entries()) {
    if (!j.equipoJugadorId || !j.posicion?.trim()) {
      throw badRequest('Cada jugador requiere equipoJugadorId y posicion')
    }
    if (vistos.has(j.equipoJugadorId)) {
      throw badRequest('Un jugador no puede aparecer dos veces en la misma formación')
    }
    vistos.add(j.equipoJugadorId)
    if (!coordenadasValidas(j.x, j.y)) {
      throw badRequest(`Coordenadas fuera de rango en el jugador ${i + 1} (0..100)`)
    }
    const ej = await prisma.equipoJugador.findFirst({
      where: { id: j.equipoJugadorId, equipoId },
      select: { id: true, estado: true },
    })
    if (!ej) {
      throw badRequest('Un jugador de la formación no pertenece al equipo')
    }
    if (ej.estado === EstadoEquipoJugador.BAJA || ej.estado === EstadoEquipoJugador.INVITADO) {
      throw badRequest('Un jugador dado de baja o sin confirmar no puede incorporarse a una formación')
    }
    resultado.push({
      equipoJugadorId: j.equipoJugadorId,
      posicion: j.posicion.trim(),
      esTitular: j.esTitular ?? false,
      x: typeof j.x === 'number' ? j.x : null,
      y: typeof j.y === 'number' ? j.y : null,
      orden: j.orden ?? i + 1,
    })
  }
  return resultado
}

async function validarPartido(prisma: PrismaClient, partidoId: string, equipoId: string): Promise<void> {
  const partido = await prisma.partido.findUnique({
    where: { id: partidoId },
    select: { id: true, equipoResponsableId: true, equipoLocalId: true, equipoVisitanteId: true },
  })
  if (!partido) {
    throw noEncontrado('Partido')
  }
  const involucra =
    partido.equipoResponsableId === equipoId || partido.equipoLocalId === equipoId || partido.equipoVisitanteId === equipoId
  if (!involucra) {
    throw badRequest('El partido no involucra al equipo de la formación')
  }
}

async function crearInstancia(
  tx: Prisma.TransactionClient,
  formacion: { id: string; nombre: string; formacionTipo: string; esquema: string | null },
  partidoId: string,
): Promise<void> {
  const jugadores = await tx.formacionJugador.findMany({
    where: { formacionId: formacion.id },
    include: { equipoJugador: { include: { jugador: { include: { persona: true } } } } },
    orderBy: { orden: 'asc' },
  })
  await tx.formacionInstancia.create({
    data: {
      formacionId: formacion.id,
      partidoId,
      nombre: formacion.nombre,
      formacionTipo: formacion.formacionTipo as never,
      esquema: formacion.esquema,
      jugadores: {
        create: jugadores.map((j) => ({
          jugadorId: j.equipoJugador.jugadorId,
          nombreSnapshot: `${j.equipoJugador.jugador.persona.nombre} ${j.equipoJugador.jugador.persona.apellido}`,
          dorsalSnapshot: j.equipoJugador.dorsal,
          posicion: j.posicion,
          esTitular: j.esTitular,
          x: j.x,
          y: j.y,
          orden: j.orden,
        })),
      },
    },
  })
}

async function cargarFormacion(id: string) {
  const prisma = getPrisma()
  return prisma.formacion.findUnique({ where: { id }, select: { id: true, equipoId: true, publicada: true } })
}

async function puedeGestionar(
  prisma: PrismaClient,
  auth: ContextoAuth,
  formacion: { equipoId: string },
): Promise<boolean> {
  return esSuperadmin(auth) || (await puedeEnEquipo(prisma, auth, formacion.equipoId, 'DELEGADO', 'TECNICO'))
}

async function puedeEliminar(
  prisma: PrismaClient,
  auth: ContextoAuth,
  formacion: { equipoId: string },
): Promise<boolean> {
  return esSuperadmin(auth) || (await puedeEnEquipo(prisma, auth, formacion.equipoId, 'DELEGADO'))
}

async function puedeVer(
  prisma: PrismaClient,
  auth: ContextoAuth,
  formacion: { equipoId: string; publicada: boolean },
): Promise<boolean> {
  if (formacion.publicada || esSuperadmin(auth)) {
    return true
  }
  if (await esMiembroEquipo(prisma, auth, formacion.equipoId)) {
    return true
  }
  if (auth.jugadorId) {
    const pertenencia = await prisma.equipoJugador.findFirst({
      where: { jugadorId: auth.jugadorId, equipoId: formacion.equipoId, estado: { not: EstadoEquipoJugador.BAJA } },
      select: { id: true },
    })
    return pertenencia !== null
  }
  return false
}

export async function formacionesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/plantillas', { preHandler: autenticar }, async () => {
    const plantillas = await getPrisma().plantillaFormacion.findMany({
      include: { posiciones: { orderBy: { orden: 'asc' } } },
      orderBy: { orden: 'asc' },
    })
    return { data: plantillas }
  })

  app.get('/formaciones', { preHandler: requierePermiso(PERMISOS.formacionesVer) }, async (request) => {
    const auth = getAuth(request)
    const prisma = getPrisma()
    if (esSuperadmin(auth)) {
      const todas = await prisma.formacion.findMany({
        include: { equipo: { select: { id: true, nombre: true, escudoUrl: true } }, _count: { select: { jugadores: true } } },
        orderBy: { fecha: 'desc' },
      })
      return { data: todas }
    }
    const equipoIds = new Set<string>()
    const eus = await prisma.equipoUsuario.findMany({ where: { usuarioId: auth.usuarioId, activo: true }, select: { equipoId: true } })
    eus.forEach((e) => equipoIds.add(e.equipoId))
    if (auth.jugadorId) {
      const pertenencias = await prisma.equipoJugador.findMany({
        where: { jugadorId: auth.jugadorId, estado: { not: EstadoEquipoJugador.BAJA } },
        select: { equipoId: true },
      })
      pertenencias.forEach((p) => equipoIds.add(p.equipoId))
    }
    const formaciones = await prisma.formacion.findMany({
      where: equipoIds.size > 0 ? { OR: [{ equipoId: { in: [...equipoIds] } }, { publicada: true }] } : { publicada: true },
      include: { equipo: { select: { id: true, nombre: true, escudoUrl: true } }, _count: { select: { jugadores: true } } },
      orderBy: { fecha: 'desc' },
    })
    return { data: formaciones }
  })

  app.post('/formaciones', { preHandler: requierePermiso(PERMISOS.formacionesGestionar) }, async (request) => {
    const auth = getAuth(request)
    const body = request.body as CrearFormacionBody
    const prisma = getPrisma()
    const nombre = body.nombre?.trim()
    if (!nombre || nombre.length < 2) {
      throw badRequest('El nombre es obligatorio')
    }
    if (!body.equipoId) {
      throw badRequest('El equipo es obligatorio')
    }
    const equipo = await prisma.equipo.findUnique({ where: { id: body.equipoId }, select: { id: true } })
    if (!equipo) {
      throw noEncontrado('Equipo')
    }
    if (!(await puedeGestionar(prisma, auth, { equipoId: body.equipoId }))) {
      throw prohibido('No tenés permiso para crear formaciones en ese equipo')
    }

    let formacionTipo = body.formacionTipo
    let esquema = body.esquema?.trim() || null
    if (body.plantillaId) {
      const plantilla = await prisma.plantillaFormacion.findUnique({
        where: { id: body.plantillaId },
        select: { formacionTipo: true, esquema: true },
      })
      if (!plantilla) {
        throw noEncontrado('Plantilla')
      }
      formacionTipo = plantilla.formacionTipo
      esquema = plantilla.esquema
    }
    if (!formacionTipo || !esTipoFormacion(formacionTipo)) {
      throw badRequest('El tipo de fútbol no es válido')
    }

    const jugadores = await validarJugadores(prisma, body.equipoId, body.jugadores)
    if (body.partidoId) {
      await validarPartido(prisma, body.partidoId, body.equipoId)
    }

    const formacion = await prisma.$transaction(async (tx) => {
      const creada = await tx.formacion.create({
        data: {
          equipoId: body.equipoId,
          partidoId: body.partidoId ?? null,
          nombre,
          formacionTipo: formacionTipo as never,
          esquema,
          notas: body.notas?.trim() || null,
          jugadores: { create: jugadores },
        },
      })
      if (body.partidoId) {
        await crearInstancia(tx, { id: creada.id, nombre, formacionTipo, esquema }, body.partidoId)
      }
      return creada
    })

    await auditar(prisma, {
      entidad: 'Formacion',
      entidadId: formacion.id,
      accion: 'CREATE',
      usuarioId: auth.usuarioId,
      cambios: { equipoId: body.equipoId, nombre, esquema, partidoId: body.partidoId ?? null },
    })
    return { data: formacion }
  })

  app.get('/formaciones/:id', { preHandler: requierePermiso(PERMISOS.formacionesVer) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const formacion = await prisma.formacion.findUnique({
      where: { id },
      include: {
         equipo: { select: { id: true, nombre: true, escudoUrl: true, configuracionPublica: true } },
        partido: { select: { id: true, tipo: true, fechaHora: true, lugar: true, equipoLocalId: true, equipoVisitanteId: true } },
        jugadores: {
          include: {
            equipoJugador: {
              include: {
                jugador: { include: { persona: { select: { nombre: true, apellido: true } } } },
              },
            },
          },
          orderBy: { orden: 'asc' },
        },
        instancias: { select: { id: true, partidoId: true, fecha: true } },
      },
    })
    if (!formacion) {
      throw noEncontrado('Formación')
    }
    if (!(await puedeVer(prisma, auth, formacion))) {
      throw prohibido('No tenés acceso a esa formación')
    }
    return {
      data: {
        ...formacion,
        jugadores: formacion.jugadores.map((j) => ({
          id: j.id,
          equipoJugadorId: j.equipoJugadorId,
          jugadorId: j.equipoJugador.jugadorId,
          nombre: `${j.equipoJugador.jugador.persona.nombre} ${j.equipoJugador.jugador.persona.apellido}`,
          dorsal: j.equipoJugador.dorsal,
          posicion: j.posicion,
          esTitular: j.esTitular,
          x: j.x,
          y: j.y,
          orden: j.orden,
        })),
      },
    }
  })

  app.patch('/formaciones/:id', { preHandler: requierePermiso(PERMISOS.formacionesGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as ModificarFormacionBody
    const prisma = getPrisma()
    const formacion = await prisma.formacion.findUnique({
      where: { id },
      select: { id: true, equipoId: true },
    })
    if (!formacion) {
      throw noEncontrado('Formación')
    }
    if (!(await puedeGestionar(prisma, auth, formacion))) {
      throw prohibido('No tenés permiso para modificar esa formación')
    }
    if (body.formacionTipo !== undefined && !TIPOS_FORMACION.includes(body.formacionTipo as never)) {
      throw badRequest('El tipo de fútbol no es válido')
    }
    const jugadores = body.jugadores !== undefined ? await validarJugadores(prisma, formacion.equipoId, body.jugadores) : null

    const actualizada = await prisma.$transaction(async (tx) => {
      if (jugadores !== null) {
        await tx.formacionJugador.deleteMany({ where: { formacionId: id } })
        await tx.formacionJugador.createMany({
          data: jugadores.map((j) => ({ formacionId: id, ...j })),
        })
      }
      return tx.formacion.update({
        where: { id },
        data: {
          nombre: body.nombre !== undefined ? body.nombre.trim() : undefined,
          formacionTipo: body.formacionTipo !== undefined ? (body.formacionTipo as never) : undefined,
          esquema: body.esquema !== undefined ? body.esquema.trim() || null : undefined,
          notas: body.notas !== undefined ? body.notas.trim() || null : undefined,
        },
      })
    })

    await auditar(prisma, {
      entidad: 'Formacion',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { campos: Object.keys(body) },
    })
    return { data: actualizada }
  })

  app.delete('/formaciones/:id', { preHandler: requierePermiso(PERMISOS.formacionesGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const formacion = await cargarFormacion(id)
    if (!formacion) {
      throw noEncontrado('Formación')
    }
    if (!(await puedeEliminar(prisma, auth, formacion))) {
      throw prohibido('Solo el DELEGADO puede eliminar formaciones')
    }
    await prisma.$transaction(async (tx) => {
      await tx.formacionJugador.deleteMany({ where: { formacionId: id } })
      await tx.formacion.delete({ where: { id } })
    })
    await auditar(prisma, {
      entidad: 'Formacion',
      entidadId: id,
      accion: 'DELETE',
      usuarioId: auth.usuarioId,
      cambios: { equipoId: formacion.equipoId },
    })
    return { data: { id } }
  })

  app.post('/formaciones/:id/clonar', { preHandler: requierePermiso(PERMISOS.formacionesGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const formacion = await prisma.formacion.findUnique({
      where: { id },
      include: { jugadores: true },
    })
    if (!formacion) {
      throw noEncontrado('Formación')
    }
    if (!(await puedeGestionar(prisma, auth, formacion))) {
      throw prohibido('No tenés permiso para clonar esa formación')
    }
    const clon = await prisma.$transaction(async (tx) => {
      const creada = await tx.formacion.create({
        data: {
          equipoId: formacion.equipoId,
          nombre: `${formacion.nombre} (copia)`,
          formacionTipo: formacion.formacionTipo,
          esquema: formacion.esquema,
          notas: formacion.notas,
          jugadores: {
            create: formacion.jugadores.map((j) => ({
              equipoJugadorId: j.equipoJugadorId,
              posicion: j.posicion,
              esTitular: j.esTitular,
              x: j.x,
              y: j.y,
              orden: j.orden,
            })),
          },
        },
      })
      return creada
    })
    await auditar(prisma, {
      entidad: 'Formacion',
      entidadId: clon.id,
      accion: 'CREATE',
      usuarioId: auth.usuarioId,
      cambios: { clonDe: id, nombre: clon.nombre },
    })
    return { data: clon }
  })

  app.post('/formaciones/:id/asociar-partido', { preHandler: requierePermiso(PERMISOS.formacionesGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = (request.body ?? {}) as { partidoId?: string }
    const prisma = getPrisma()
    const formacion = await prisma.formacion.findUnique({
      where: { id },
      select: { id: true, equipoId: true, nombre: true, formacionTipo: true, esquema: true },
    })
    if (!formacion) {
      throw noEncontrado('Formación')
    }
    if (!(await puedeGestionar(prisma, auth, formacion))) {
      throw prohibido('No tenés permiso para asociar esa formación')
    }
    if (!body.partidoId) {
      throw badRequest('El partido es obligatorio')
    }
    await validarPartido(prisma, body.partidoId, formacion.equipoId)
    const existente = await prisma.formacionInstancia.findUnique({
      where: { formacionId_partidoId: { formacionId: id, partidoId: body.partidoId } },
      select: { id: true },
    })
    if (existente) {
      throw conflicto('instancia_existente', 'La formación ya está asociada a ese partido')
    }
    await prisma.$transaction(async (tx) => {
      await crearInstancia(tx, formacion, body.partidoId as string)
      await tx.formacion.update({ where: { id }, data: { partidoId: body.partidoId } })
    })
    await auditar(prisma, {
      entidad: 'Formacion',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { asociadaAPartido: body.partidoId },
    })
    return { data: { id, partidoId: body.partidoId } }
  })

  app.post('/formaciones/:id/publicar', { preHandler: requierePermiso(PERMISOS.formacionesGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const formacion = await cargarFormacion(id)
    if (!formacion) {
      throw noEncontrado('Formación')
    }
    if (!(await puedeGestionar(prisma, auth, formacion))) {
      throw prohibido('No tenés permiso para publicar esa formación')
    }
    const actualizada = await prisma.formacion.update({
      where: { id },
      data: { publicada: true },
      select: { id: true, publicada: true },
    })
    await auditar(prisma, {
      entidad: 'Formacion',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { publicada: true },
    })
    return { data: actualizada }
  })

  app.post('/formaciones/:id/despublicar', { preHandler: requierePermiso(PERMISOS.formacionesGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const formacion = await cargarFormacion(id)
    if (!formacion) {
      throw noEncontrado('Formación')
    }
    if (!(await puedeGestionar(prisma, auth, formacion))) {
      throw prohibido('No tenés permiso para despublicar esa formación')
    }
    const actualizada = await prisma.formacion.update({
      where: { id },
      data: { publicada: false },
      select: { id: true, publicada: true },
    })
    await auditar(prisma, {
      entidad: 'Formacion',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { publicada: false },
    })
    return { data: actualizada }
  })

  app.get('/publico/formaciones', async () => {
    const formaciones = await getPrisma().formacion.findMany({
      where: { publicada: true, equipo: { privado: false }, OR: [{ partidoId: null }, { partido: { publicada: true, equipoLocal: { privado: false }, equipoVisitante: { privado: false }, OR: [{ torneoId: null }, { torneo: { visiblePublico: true } }] } }] },
      select: {
        id: true,
        nombre: true,
        esquema: true,
        formacionTipo: true,
        fecha: true,
         equipo: { select: { id: true, nombre: true, escudoUrl: true, configuracionPublica: true } },
      },
      orderBy: { fecha: 'desc' },
    })
    return { data: formaciones }
  })

  app.get('/publico/formaciones/:id', async (request) => {
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const formacion = await prisma.formacion.findUnique({
      where: { id, publicada: true, equipo: { privado: false }, OR: [{ partidoId: null }, { partido: { publicada: true, equipoLocal: { privado: false }, equipoVisitante: { privado: false }, OR: [{ torneoId: null }, { torneo: { visiblePublico: true } }] } }] },
      select: {
        id: true,
        nombre: true,
        esquema: true,
        formacionTipo: true,
        fecha: true,
        publicada: true,
         equipo: { select: { id: true, nombre: true, escudoUrl: true, configuracionPublica: true } },
        jugadores: {
          include: {
            equipoJugador: {
              include: { jugador: { include: { persona: { select: { nombre: true, apellido: true } } } } },
            },
          },
          orderBy: { orden: 'asc' },
        },
      },
    })
    if (!formacion) {
      throw noEncontrado('Formación')
    }
    return {
      data: {
        id: formacion.id,
        nombre: formacion.nombre,
        esquema: formacion.esquema,
        formacionTipo: formacion.formacionTipo,
        fecha: formacion.fecha,
        equipo: formacion.equipo,
        jugadores: formacion.jugadores.map((j) => ({
          nombre: `${j.equipoJugador.jugador.persona.nombre} ${j.equipoJugador.jugador.persona.apellido}`,
          dorsal: j.equipoJugador.dorsal,
          posicion: j.posicion,
          esTitular: j.esTitular,
          x: j.x,
          y: j.y,
        })),
      },
    }
  })
}
