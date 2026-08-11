import type { FastifyInstance } from 'fastify'
import { PERMISOS } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { getAuth, requierePermiso } from '../plugins/auth.js'
import { esAdminDeTorneo, puedeVerTorneo } from '../auth/permisos.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { auditar } from '../auth/auditoria.js'
import { cargarCompetencia, calcularTabla, equiposConfirmados, generarFixture, leerReglas, validarCantidad } from '../fixture/servicio.js'

interface FixtureBody { zonaId?: string | null; confirmar?: boolean }

async function competenciaConPermiso(id: string, auth: ReturnType<typeof getAuth>) {
  const prisma = getPrisma(); const tc = await cargarCompetencia(prisma, id)
  if (!tc) throw noEncontrado('Competición')
  if (!(await esAdminDeTorneo(prisma, auth, tc.torneoId))) throw prohibido('No tenés permiso para administrar esa competición')
  return tc
}

async function fixtureRespuesta(torneoCategoriaId: string, zonaId: string | null, publico = false) {
  const prisma = getPrisma(); const tc = await cargarCompetencia(prisma, torneoCategoriaId, zonaId)
  if (!tc) throw noEncontrado('Competición')
  const configPublica = tc.torneo.configuracionPublica as { mostrarFixture?: boolean } | null
  if (publico && (!tc.torneo.visiblePublico || configPublica?.mostrarFixture !== true)) throw noEncontrado('Fixture')
  const partidos = await prisma.partido.findMany({ where: { torneoCategoriaId, zonaId, jornadaId: { not: null }, ...(publico ? { publicada: true } : {}) }, include: { equipoLocal: { select: { id: true, nombre: true, escudoUrl: true } }, equipoVisitante: { select: { id: true, nombre: true, escudoUrl: true } } }, orderBy: [{ jornada: { numero: 'asc' } }, { fechaHora: 'asc' }] })
  const jornadas = await prisma.jornada.findMany({ where: { torneoCategoriaId, zonaId }, include: { descansos: { include: { equipo: { select: { id: true, nombre: true } } } } }, orderBy: { numero: 'asc' } })
  return { jornadas: jornadas.map((j) => ({ ...j, partidos: partidos.filter((p) => p.jornadaId === j.id) })), publicada: publico }
}

export async function fixtureRoutes(app: FastifyInstance): Promise<void> {
  app.post('/torneo-categorias/:id/fixture/validar', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as FixtureBody
    const tc = await competenciaConPermiso(id, auth); const equipos = await equiposConfirmados(getPrisma(), id, body.zonaId ?? null); validarCantidad(equipos)
    return { data: { valida: true, formato: tc.configuracion?.formato, equipos: equipos.map((e) => e.equipo), zonaId: body.zonaId ?? null } }
  })
  app.post('/torneo-categorias/:id/fixture/generar', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as FixtureBody
    if (body.confirmar !== true) throw badRequest('La generación requiere confirmar: true')
    const tc = await competenciaConPermiso(id, auth); const formato = tc.configuracion?.formato
    const ruedas = formato === 'DOS_RUEDAS' ? 2 : 1
    const data = await generarFixture(getPrisma(), { torneoCategoriaId: id, zonaId: body.zonaId ?? null, ruedas, usuarioId: auth.usuarioId, regenerar: false })
    return { data }
  })
  app.post('/torneo-categorias/:id/fixture/regenerar', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as FixtureBody
    if (body.confirmar !== true) throw badRequest('La regeneración requiere confirmar: true')
    const tc = await competenciaConPermiso(id, auth); const ruedas = tc.configuracion?.formato === 'DOS_RUEDAS' ? 2 : 1
    try { return { data: await generarFixture(getPrisma(), { torneoCategoriaId: id, zonaId: body.zonaId ?? null, ruedas, usuarioId: auth.usuarioId, regenerar: true }) } } catch (error) { if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'fixture_bloqueado') await auditar(getPrisma(), { entidad: 'Fixture', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { operacion: 'regenerar_rechazada' } }); throw error }
  })
  app.get('/torneo-categorias/:id/fixture', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const query = request.query as { zonaId?: string }
    const tc = await cargarCompetencia(getPrisma(), id, query.zonaId ?? null); if (!tc) throw noEncontrado('Competición'); if (!(await puedeVerTorneo(getPrisma(), auth, tc.torneoId))) throw prohibido('No tenés acceso a esa competición'); return { data: await fixtureRespuesta(id, query.zonaId ?? null) }
  })
  app.get('/zonas/:id/fixture', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const zona = await getPrisma().zona.findUnique({ where: { id }, select: { torneoCategoriaId: true } }); if (!zona) throw noEncontrado('Zona'); const tc = await cargarCompetencia(getPrisma(), zona.torneoCategoriaId, id); if (!tc || !(await puedeVerTorneo(getPrisma(), auth, tc.torneoId))) throw prohibido('No tenés acceso a esa zona'); return { data: await fixtureRespuesta(zona.torneoCategoriaId, id) }
  })
  app.get('/jornadas/:id', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const jornada = await getPrisma().jornada.findUnique({ where: { id }, include: { torneoCategoria: { select: { torneoId: true } }, descansos: { include: { equipo: { select: { id: true, nombre: true } } } }, partidos: { include: { equipoLocal: { select: { id: true, nombre: true } }, equipoVisitante: { select: { id: true, nombre: true } } } } } }); if (!jornada) throw noEncontrado('Jornada'); if (!(await puedeVerTorneo(getPrisma(), auth, jornada.torneoCategoria.torneoId))) throw prohibido('No tenés acceso a esa jornada'); return { data: jornada }
  })
  app.patch('/jornadas/:id', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { nombre?: string; fechaInicio?: string }; const prisma = getPrisma(); const jornada = await prisma.jornada.findUnique({ where: { id }, include: { torneoCategoria: { select: { torneoId: true } }, partidos: { select: { estado: true } } } }); if (!jornada) throw noEncontrado('Jornada'); if (!(await esAdminDeTorneo(prisma, auth, jornada.torneoCategoria.torneoId))) throw prohibido('No tenés permiso para editar la jornada'); if (jornada.partidos.some((p) => p.estado !== 'PROGRAMADO')) throw conflicto('jornada_en_uso', 'La jornada ya tiene partidos operativos'); const actualizada = await prisma.jornada.update({ where: { id }, data: { nombre: body.nombre?.trim() || undefined, fechaInicio: body.fechaInicio ? new Date(body.fechaInicio) : undefined } }); await auditar(prisma, { entidad: 'Jornada', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { campos: Object.keys(body) } }); return { data: actualizada }
  })
  app.get('/torneo-categorias/:id/tabla', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const query = request.query as { zonaId?: string }; const prisma = getPrisma(); const tc = await cargarCompetencia(prisma, id, query.zonaId ?? null); if (!tc) throw noEncontrado('Competición'); if (!(await puedeVerTorneo(prisma, auth, tc.torneoId))) throw prohibido('No tenés acceso a esa competición'); const reglas = leerReglas(tc.configuracion ?? { sistemaPuntos: null, desempates: null }); const equipos = await equiposConfirmados(prisma, id, query.zonaId ?? null); const partidos = await prisma.partido.findMany({ where: { torneoCategoriaId: id, zonaId: query.zonaId ?? null, tipo: 'OFICIAL', estado: 'FINALIZADO' }, select: { equipoLocalId: true, equipoVisitanteId: true, golesLocal: true, golesVisitante: true } }); return { data: calcularTabla(equipos.map((e) => e.equipo), partidos, reglas) }
  })
  app.get('/zonas/:id/tabla', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const prisma = getPrisma(); const zona = await prisma.zona.findUnique({ where: { id }, select: { torneoCategoriaId: true } }); if (!zona) throw noEncontrado('Zona'); const tc = await cargarCompetencia(prisma, zona.torneoCategoriaId, id); if (!tc || !(await puedeVerTorneo(prisma, auth, tc.torneoId))) throw prohibido('No tenés acceso a esa zona'); const reglas = leerReglas(tc.configuracion ?? { sistemaPuntos: null, desempates: null }); const equipos = await equiposConfirmados(prisma, zona.torneoCategoriaId, id); const partidos = await prisma.partido.findMany({ where: { torneoCategoriaId: zona.torneoCategoriaId, zonaId: id, tipo: 'OFICIAL', estado: 'FINALIZADO' }, select: { equipoLocalId: true, equipoVisitanteId: true, golesLocal: true, golesVisitante: true } }); return { data: calcularTabla(equipos.map((e) => e.equipo), partidos, reglas) }
  })
  app.get('/publico/torneo-categorias/:id/fixture', async (request) => { const { id } = request.params as { id: string }; const query = request.query as { zonaId?: string }; return { data: await fixtureRespuesta(id, query.zonaId ?? null, true) } })
  app.get('/publico/torneo-categorias/:id/tabla', async (request) => { const { id } = request.params as { id: string }; const query = request.query as { zonaId?: string }; const prisma = getPrisma(); const tc = await cargarCompetencia(prisma, id, query.zonaId ?? null); if (!tc) throw noEncontrado('Competición'); const config = tc.torneo.configuracionPublica as { mostrarTabla?: boolean } | null; if (!tc.torneo.visiblePublico || config?.mostrarTabla !== true) throw noEncontrado('Tabla'); const reglas = leerReglas(tc.configuracion ?? { sistemaPuntos: null, desempates: null }); const equipos = await equiposConfirmados(prisma, id, query.zonaId ?? null); const partidos = await prisma.partido.findMany({ where: { torneoCategoriaId: id, zonaId: query.zonaId ?? null, tipo: 'OFICIAL', estado: 'FINALIZADO', publicada: true }, select: { equipoLocalId: true, equipoVisitanteId: true, golesLocal: true, golesVisitante: true } }); return { data: calcularTabla(equipos.map((e) => e.equipo), partidos, reglas) } })
}
