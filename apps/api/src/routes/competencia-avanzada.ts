import type { FastifyInstance } from 'fastify'
import { PERMISOS } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { getAuth, requierePermiso } from '../plugins/auth.js'
import { esAdminDeTorneo, puedeVerTorneo } from '../auth/permisos.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { crearFaseEliminacion, crearFaseGrupos, generarFase, tablaGrupo } from '../competencia-avanzada/servicio.js'

async function administrar(id: string, auth: ReturnType<typeof getAuth>) {
  const tc = await getPrisma().torneoCategoria.findUnique({ where: { id }, select: { torneoId: true } })
  if (!tc) throw noEncontrado('Competición')
  if (!(await esAdminDeTorneo(getPrisma(), auth, tc.torneoId))) throw prohibido('No tenés permiso para administrar esa competición')
  return tc
}

export async function competenciaAvanzadaRoutes(app: FastifyInstance): Promise<void> {
  app.post('/torneo-categorias/:id/fases/validar', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { tipo?: string; grupos?: Array<{ participacionIds: string[] }>; seeds?: Array<{ participacionId: string; seed: number }> }
    await administrar(id, auth)
    const ids = body.tipo === 'GRUPOS' ? body.grupos?.flatMap((grupo) => grupo.participacionIds) : body.tipo === 'ELIMINACION_DIRECTA' ? body.seeds?.map((seed) => seed.participacionId) : undefined
    if (!ids?.length || new Set(ids).size !== ids.length) throw badRequest('Participaciones de fase inválidas o duplicadas')
    return { data: { valida: true, tipo: body.tipo, participaciones: ids.length } }
  })
  app.post('/torneo-categorias/:id/fases/generar', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { tipo: string; orden: number; nombre: string; confirmar?: boolean; grupos?: Array<{ nombre: string; participacionIds: string[] }>; ruedas?: number; seeds?: Array<{ participacionId: string; seed: number }> }
    if (body.confirmar !== true) throw badRequest('La generación requiere confirmar: true')
    await administrar(id, auth)
    const fase = body.tipo === 'GRUPOS'
      ? await crearFaseGrupos(getPrisma(), { torneoCategoriaId: id, orden: body.orden, nombre: body.nombre, grupos: body.grupos ?? [], ruedas: body.ruedas ?? 0, usuarioId: auth.usuarioId })
      : body.tipo === 'ELIMINACION_DIRECTA'
        ? await crearFaseEliminacion(getPrisma(), { torneoCategoriaId: id, orden: body.orden, nombre: body.nombre, seeds: body.seeds ?? [], usuarioId: auth.usuarioId })
        : (() => { throw badRequest('Tipo de fase fuera de alcance FASE 16A') })()
    return { data: await generarFase(getPrisma(), fase.id, auth.usuarioId) }
  })
  app.post('/torneo-categorias/:id/fases/grupos', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { orden: number; nombre: string; grupos: Array<{ nombre: string; participacionIds: string[] }>; ruedas: number }
    await administrar(id, auth)
    return { data: await crearFaseGrupos(getPrisma(), { torneoCategoriaId: id, ...body, usuarioId: auth.usuarioId }) }
  })
  app.post('/torneo-categorias/:id/fases/eliminacion', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { orden: number; nombre: string; seeds: Array<{ participacionId: string; seed: number }> }
    await administrar(id, auth)
    return { data: await crearFaseEliminacion(getPrisma(), { torneoCategoriaId: id, ...body, usuarioId: auth.usuarioId }) }
  })
  app.post('/fases-competencia/:id/generar', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { confirmar?: boolean }
    if (body.confirmar !== true) throw badRequest('La generación requiere confirmar: true')
    const fase = await getPrisma().faseCompetencia.findUnique({ where: { id }, select: { torneoCategoriaId: true } }); if (!fase) throw noEncontrado('Fase')
    await administrar(fase.torneoCategoriaId, auth)
    return { data: await generarFase(getPrisma(), id, auth.usuarioId) }
  })
  app.post('/fases-competencia/:id/regenerar', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { confirmar?: boolean }
    if (body.confirmar !== true) throw badRequest('La regeneración requiere confirmar: true')
    const fase = await getPrisma().faseCompetencia.findUnique({ where: { id }, include: { grupos: { include: { jornadas: { include: { partidos: true } } } }, rondas: { include: { llaves: { include: { partidos: true } } } } } })
    if (!fase) throw noEncontrado('Fase'); await administrar(fase.torneoCategoriaId, auth)
    const partidos = [...fase.grupos.flatMap((g) => g.jornadas.flatMap((j) => j.partidos)), ...fase.rondas.flatMap((r) => r.llaves.flatMap((l) => l.partidos))]
    const actividad = await Promise.all(partidos.map(async (p) => Promise.all([getPrisma().eventoPartido.count({ where: { partidoId: p.id } }), getPrisma().convocatoria.count({ where: { partidoId: p.id } }), getPrisma().formacionInstancia.count({ where: { partidoId: p.id } }), getPrisma().sancion.count({ where: { partidoId: p.id } })])))
    if (partidos.some((p) => p.estado !== 'PROGRAMADO' || p.golesLocal !== null || p.golesVisitante !== null || p.publicada) || actividad.some((conteos) => conteos.some(Boolean)) || fase.rondas.some((r) => r.llaves.some((l) => l.estado === 'RESUELTA' || l.estado === 'PENDIENTE_DEFINICION'))) throw conflicto('fase_bloqueada', 'La fase contiene actividad o descendientes históricos')
    await getPrisma().$transaction(async (tx) => { await tx.partido.deleteMany({ where: { id: { in: partidos.map((p) => p.id) } } }); await tx.jornadaEquipoDescanso.deleteMany({ where: { jornada: { grupoCompetencia: { faseCompetenciaId: id } } } }); await tx.jornada.deleteMany({ where: { grupoCompetencia: { faseCompetenciaId: id } } }); await tx.llaveCompetencia.deleteMany({ where: { rondaEliminatoria: { faseCompetenciaId: id } } }); await tx.rondaEliminatoria.deleteMany({ where: { faseCompetenciaId: id } }); await tx.faseCompetencia.update({ where: { id }, data: { estado: 'BORRADOR' } }) })
    return { data: await generarFase(getPrisma(), id, auth.usuarioId) }
  })
  app.get('/torneo-categorias/:id/competencia-avanzada', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const tc = await getPrisma().torneoCategoria.findUnique({ where: { id }, select: { torneoId: true } }); if (!tc) throw noEncontrado('Competición'); if (!(await puedeVerTorneo(getPrisma(), auth, tc.torneoId))) throw prohibido('No tenés acceso a esa competición')
    return { data: await getPrisma().faseCompetencia.findMany({ where: { torneoCategoriaId: id }, include: { grupos: { include: { participaciones: { include: { equipo: { select: { id: true, nombre: true } } } } } }, rondas: { include: { llaves: { include: { participacionLocal: { select: { id: true, equipoId: true, equipo: { select: { nombre: true, escudoUrl: true } } } }, participacionVisitante: { select: { id: true, equipoId: true, equipo: { select: { nombre: true, escudoUrl: true } } } }, ganadorParticipacion: { select: { id: true, equipoId: true, equipo: { select: { nombre: true, escudoUrl: true } } } }, partidos: true } } } } }, orderBy: { orden: 'asc' } }) }
  })
  app.get('/fases-competencia/:id/grupos/:grupoId/tabla', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request); const { id, grupoId } = request.params as { id: string; grupoId: string }; const fase = await getPrisma().faseCompetencia.findUnique({ where: { id }, select: { torneoCategoria: { select: { torneoId: true } } } }); if (!fase) throw noEncontrado('Fase'); if (!(await puedeVerTorneo(getPrisma(), auth, fase.torneoCategoria.torneoId))) throw prohibido('No tenés acceso a esa fase')
    return { data: await tablaGrupo(getPrisma(), id, grupoId) }
  })
}
