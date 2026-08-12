import type { FastifyInstance } from 'fastify'
import { getPrisma } from '../db.js'
import { noEncontrado } from '../http.js'
import { calcularTabla, equiposConfirmados, leerReglas } from '../fixture/servicio.js'
import { estadisticasPartido } from './eventos-partido.js'

type ConfigPublica = {
  mostrarFixture?: boolean
  mostrarTabla?: boolean
  mostrarEstadisticas?: boolean
  mostrarGoleadores?: boolean
  mostrarTarjetas?: boolean
}

type ConfigEquipo = {
  mostrarNombre?: boolean
  mostrarEscudo?: boolean
  mostrarPlantel?: boolean
  mostrarContacto?: boolean
}

function config<T>(value: unknown): T {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : ({} as T)
}

async function competenciaPublica(id: string, zonaId?: string | null) {
  const prisma = getPrisma()
  const tc = await prisma.torneoCategoria.findUnique({
    where: { id },
    select: {
      id: true,
      torneoId: true,
      temporadaId: true,
      torneo: { select: { id: true, nombre: true, visiblePublico: true, configuracionPublica: true } },
      temporada: { select: { id: true, nombre: true, torneoId: true } },
      categoria: { select: { id: true, nombre: true, descripcion: true } },
      zonas: zonaId ? { where: { id: zonaId }, select: { id: true } } : { select: { id: true } },
      configuracion: true,
    },
  })
  if (!tc || tc.temporada.torneoId !== tc.torneoId || !tc.torneo.visiblePublico || (zonaId && tc.zonas.length === 0)) {
    throw noEncontrado('Competición')
  }
  return tc
}

async function equipoPublico(id: string) {
  const prisma = getPrisma()
  const equipo = await prisma.equipo.findUnique({
    where: { id },
    select: {
      id: true,
      nombre: true,
      escudoUrl: true,
      descripcion: true,
      colorPrincipal: true,
      colorSecundario: true,
      privado: true,
      configuracionPublica: true,
      jugadores: {
        where: { estado: { not: 'BAJA' } },
        select: {
          dorsal: true,
          posiciones: true,
          jugador: { select: { persona: { select: { nombre: true, apellido: true, fotoUrl: true } } } },
        },
      },
      participaciones: { where: { torneo: { visiblePublico: true }, estado: { in: ['INSCRIPTO', 'CONFIRMADO'] } }, select: { id: true } },
    },
  })
  const c = config<ConfigEquipo>(equipo?.configuracionPublica)
  if (!equipo || equipo.privado || equipo.participaciones.length === 0) throw noEncontrado('Equipo')
  return {
    id: equipo.id,
    ...(c.mostrarNombre !== false ? { nombre: equipo.nombre } : {}),
    ...(c.mostrarEscudo !== false ? { escudoUrl: equipo.escudoUrl } : {}),
    descripcion: equipo.descripcion,
    colorPrincipal: equipo.colorPrincipal,
    colorSecundario: equipo.colorSecundario,
    ...(c.mostrarPlantel === true
      ? {
          plantel: equipo.jugadores.map((j) => ({
            nombre: `${j.jugador.persona.nombre} ${j.jugador.persona.apellido}`,
            fotoUrl: j.jugador.persona.fotoUrl,
            dorsal: j.dorsal,
            posiciones: j.posiciones,
          })),
        }
      : {}),
  }
}

export async function publicoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/publico/torneos', async () => ({
    data: await getPrisma().torneo.findMany({
      where: { visiblePublico: true },
      select: { id: true, nombre: true, descripcion: true, logoUrl: true, estado: true, configuracionPublica: true },
      orderBy: { createdAt: 'desc' },
    }),
  }))

  app.get('/publico/torneos/:id', async (request) => {
    const { id } = request.params as { id: string }
    const torneo = await getPrisma().torneo.findFirst({
      where: { id, visiblePublico: true },
      select: {
        id: true, nombre: true, descripcion: true, logoUrl: true, reglas: true, estado: true, configuracionPublica: true,
        temporadas: { orderBy: { fechaInicio: 'asc' }, select: { id: true, nombre: true, estado: true, fechaInicio: true, fechaFin: true } },
      },
    })
    if (!torneo) throw noEncontrado('Torneo')
    return { data: torneo }
  })

  app.get('/publico/torneos/:torneoId/temporadas', async (request) => {
    const { torneoId } = request.params as { torneoId: string }
    const torneo = await getPrisma().torneo.findFirst({ where: { id: torneoId, visiblePublico: true }, select: { id: true } })
    if (!torneo) throw noEncontrado('Torneo')
    return { data: await getPrisma().temporada.findMany({ where: { torneoId }, select: { id: true, nombre: true, estado: true, fechaInicio: true, fechaFin: true }, orderBy: { fechaInicio: 'asc' } }) }
  })

  app.get('/publico/temporadas/:id/categorias', async (request) => {
    const { id } = request.params as { id: string }
    const temporada = await getPrisma().temporada.findFirst({ where: { id, torneo: { visiblePublico: true } }, select: { id: true } })
    if (!temporada) throw noEncontrado('Temporada')
    return { data: await getPrisma().torneoCategoria.findMany({ where: { temporadaId: id, torneo: { visiblePublico: true } }, select: { id: true, categoria: { select: { id: true, nombre: true, descripcion: true } }, estado: true }, orderBy: { createdAt: 'asc' } }) }
  })

  app.get('/publico/torneo-categorias/:id/zonas', async (request) => {
    const { id } = request.params as { id: string }
    await competenciaPublica(id)
    return { data: await getPrisma().zona.findMany({ where: { torneoCategoriaId: id, torneoCategoria: { torneo: { visiblePublico: true } } }, select: { id: true, nombre: true }, orderBy: { createdAt: 'asc' } }) }
  })

  app.get('/publico/torneo-categorias/:id/fases', async (request) => {
    const { id } = request.params as { id: string }
    const tc = await competenciaPublica(id)
    const c = config<ConfigPublica>(tc.torneo.configuracionPublica)
    if (c.mostrarFixture !== true) throw noEncontrado('Fases')
    const fases = await getPrisma().faseCompetencia.findMany({
      where: { torneoCategoriaId: id },
      include: {
        grupos: { include: { participaciones: { where: { equipo: { privado: false } }, include: { equipo: { select: { id: true, nombre: true, escudoUrl: true } } } } }, orderBy: { orden: 'asc' } },
        rondas: { include: { llaves: { include: { participacionLocal: { include: { equipo: { select: { id: true, nombre: true, escudoUrl: true, privado: true } } } }, participacionVisitante: { include: { equipo: { select: { id: true, nombre: true, escudoUrl: true, privado: true } } } }, ganadorParticipacion: { include: { equipo: { select: { id: true, nombre: true, escudoUrl: true, privado: true } } } }, partidos: { where: { publicada: true }, select: { id: true, fechaHora: true, estado: true, golesLocal: true, golesVisitante: true } } }, orderBy: { orden: 'asc' } } }, orderBy: { orden: 'asc' } },
      }, orderBy: { orden: 'asc' },
    })
    return { data: fases.map((fase) => ({ ...fase, rondas: fase.rondas.map((ronda) => ({ ...ronda, llaves: ronda.llaves.filter((llave) => !llave.participacionLocal?.equipo.privado && !llave.participacionVisitante?.equipo.privado && !llave.ganadorParticipacion?.equipo.privado) })) })) }
  })

  app.get('/publico/torneo-categorias/:id/estadisticas', async (request) => {
    const { id } = request.params as { id: string }
    const tc = await competenciaPublica(id)
    const c = config<ConfigPublica>(tc.torneo.configuracionPublica)
    if (c.mostrarEstadisticas !== true) throw noEncontrado('Estadísticas')
    const eventos = await getPrisma().eventoPartido.findMany({ where: { partido: { torneoCategoriaId: id, tipo: 'OFICIAL', estado: 'FINALIZADO', publicada: true, equipoLocal: { privado: false }, equipoVisitante: { privado: false } }, anulado: false }, select: { tipo: true } })
    return { data: { torneoCategoriaId: id, goles: eventos.filter((e) => e.tipo === 'GOL').length, asistencias: eventos.filter((e) => e.tipo === 'ASISTENCIA').length, tarjetas: eventos.filter((e) => e.tipo === 'TARJETA').length } }
  })

  app.get('/publico/equipos', async () => {
    const equipos = await getPrisma().equipo.findMany({ where: { privado: false, participaciones: { some: { torneo: { visiblePublico: true }, estado: { in: ['INSCRIPTO', 'CONFIRMADO'] } } } }, select: { id: true } })
    return { data: await Promise.all(equipos.map((e) => equipoPublico(e.id))) }
  })

  app.get('/publico/equipos/:id', async (request) => ({ data: await equipoPublico((request.params as { id: string }).id) }))

  app.get('/publico/torneo-categorias/:id/fixture', async (request) => {
    const { id } = request.params as { id: string }
    const query = request.query as { zonaId?: string }
    const tc = await competenciaPublica(id, query.zonaId)
    const c = config<ConfigPublica>(tc.torneo.configuracionPublica)
    if (c.mostrarFixture !== true) throw noEncontrado('Fixture')
    const prisma = getPrisma()
    const partidos = await prisma.partido.findMany({ where: { torneoCategoriaId: id, zonaId: query.zonaId ?? null, jornadaId: { not: null }, publicada: true, equipoLocal: { privado: false }, equipoVisitante: { privado: false } }, select: { id: true, fechaHora: true, estado: true, golesLocal: true, golesVisitante: true, equipoLocal: { select: { id: true, nombre: true, escudoUrl: true } }, equipoVisitante: { select: { id: true, nombre: true, escudoUrl: true } }, jornadaId: true }, orderBy: { fechaHora: 'asc' } })
    const jornadas = await prisma.jornada.findMany({ where: { torneoCategoriaId: id, zonaId: query.zonaId ?? null }, select: { id: true, numero: true, nombre: true, fechaInicio: true }, orderBy: { numero: 'asc' } })
    return { data: { jornadas: jornadas.map((j) => ({ ...j, partidos: partidos.filter((p) => p.jornadaId === j.id) })), publicada: true } }
  })

  app.get('/publico/torneo-categorias/:id/tabla', async (request) => {
    const { id } = request.params as { id: string }
    const query = request.query as { zonaId?: string }
    const tc = await competenciaPublica(id, query.zonaId)
    const c = config<ConfigPublica>(tc.torneo.configuracionPublica)
    if (c.mostrarTabla !== true) throw noEncontrado('Tabla')
    const equipos = await equiposConfirmados(getPrisma(), id, query.zonaId ?? null)
    const partidos = await getPrisma().partido.findMany({ where: { torneoCategoriaId: id, zonaId: query.zonaId ?? null, tipo: 'OFICIAL', estado: 'FINALIZADO', publicada: true, equipoLocal: { privado: false }, equipoVisitante: { privado: false } }, select: { equipoLocalId: true, equipoVisitanteId: true, golesLocal: true, golesVisitante: true } })
    return { data: calcularTabla(equipos.filter((e) => !e.equipo.privado).map((e) => e.equipo), partidos, leerReglas(tc.configuracion ?? { sistemaPuntos: null, desempates: null })) }
  })

  app.get('/publico/zonas/:id/fixture', async (request) => {
    const { id } = request.params as { id: string }
    const zona = await getPrisma().zona.findUnique({ where: { id }, select: { torneoCategoriaId: true } })
    if (!zona) throw noEncontrado('Zona')
    const response = await app.inject({ method: 'GET', url: `/api/publico/torneo-categorias/${zona.torneoCategoriaId}/fixture?zonaId=${id}` })
    if (response.statusCode !== 200) throw noEncontrado('Fixture')
    return { data: response.json().data }
  })

  app.get('/publico/zonas/:id/tabla', async (request) => {
    const { id } = request.params as { id: string }
    const zona = await getPrisma().zona.findUnique({ where: { id }, select: { torneoCategoriaId: true } })
    if (!zona) throw noEncontrado('Zona')
    const response = await app.inject({ method: 'GET', url: `/api/publico/torneo-categorias/${zona.torneoCategoriaId}/tabla?zonaId=${id}` })
    if (response.statusCode !== 200) throw noEncontrado('Tabla')
    return { data: response.json().data }
  })

  app.get('/publico/partidos/:id/estadisticas', async (request) => {
    const { id } = request.params as { id: string }
    const partido = await getPrisma().partido.findUnique({ where: { id }, select: { publicada: true, equipoLocal: { select: { privado: true } }, equipoVisitante: { select: { privado: true } }, torneo: { select: { visiblePublico: true, configuracionPublica: true } } } })
    const c = config<ConfigPublica>(partido?.torneo?.configuracionPublica)
    if (!partido?.publicada || partido.equipoLocal?.privado || partido.equipoVisitante?.privado || (partido.torneo && (!partido.torneo.visiblePublico || c.mostrarEstadisticas !== true))) throw noEncontrado('Estadísticas')
    return { data: await estadisticasPartido(getPrisma(), id) }
  })
}
