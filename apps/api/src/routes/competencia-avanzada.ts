import type { FastifyInstance } from 'fastify'
import { PERMISOS } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { getAuth, requierePermiso } from '../plugins/auth.js'
import { esAdminDeTorneo, puedeVerTorneo } from '../auth/permisos.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { actualizarReglaClasificacion, clasificarFase, configurarRonda, crearFaseEliminacion, crearFaseGrupos, crearReglaClasificacion, definirLlave, generarFase, invalidarClasificacion, invalidarResolucionLlave, previsualizarClasificacion, recalcularLlave, resumenLlave, tablaGrupo } from '../competencia-avanzada/servicio.js'

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
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { tipo: string; orden: number; nombre: string; confirmar?: boolean; grupos?: Array<{ nombre: string; participacionIds: string[] }>; ruedas?: number; seeds?: Array<{ participacionId: string; seed: number }>; configuracion?: { rondas?: Array<{ orden: number; formatoSerie?: 'PARTIDO_UNICO' | 'IDA_VUELTA'; permiteAlargue?: boolean; permitePenales?: boolean }>; tercerPuesto?: boolean } }
    if (body.confirmar !== true) throw badRequest('La generación requiere confirmar: true')
    await administrar(id, auth)
    const fase = body.tipo === 'GRUPOS'
      ? await crearFaseGrupos(getPrisma(), { torneoCategoriaId: id, orden: body.orden, nombre: body.nombre, grupos: body.grupos ?? [], ruedas: body.ruedas ?? 0, usuarioId: auth.usuarioId })
      : body.tipo === 'ELIMINACION_DIRECTA'
        ? await crearFaseEliminacion(getPrisma(), { torneoCategoriaId: id, orden: body.orden, nombre: body.nombre, seeds: body.seeds ?? [], configuracion: body.configuracion, usuarioId: auth.usuarioId })
        : (() => { throw badRequest('Tipo de fase fuera de alcance FASE 16A') })()
    return { data: await generarFase(getPrisma(), fase.id, auth.usuarioId) }
  })
  app.post('/torneo-categorias/:id/fases/grupos', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { orden: number; nombre: string; grupos: Array<{ nombre: string; participacionIds: string[] }>; ruedas: number }
    await administrar(id, auth)
    return { data: await crearFaseGrupos(getPrisma(), { torneoCategoriaId: id, ...body, usuarioId: auth.usuarioId }) }
  })
  app.post('/torneo-categorias/:id/fases/eliminacion', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { orden: number; nombre: string; seeds: Array<{ participacionId: string; seed: number }>; configuracion?: { rondas?: Array<{ orden: number; formatoSerie?: 'PARTIDO_UNICO' | 'IDA_VUELTA'; permiteAlargue?: boolean; permitePenales?: boolean }>; tercerPuesto?: boolean } }
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
  app.post('/fases-competencia/:id/reglas-clasificacion', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }
    const fase = await getPrisma().faseCompetencia.findUnique({ where: { id }, select: { torneoCategoriaId: true } }); if (!fase) throw noEncontrado('Fase')
    await administrar(fase.torneoCategoriaId, auth)
    return { data: await crearReglaClasificacion(getPrisma(), id, request.body as never, auth.usuarioId) }
  })
  app.patch('/reglas-clasificacion/:id', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }
    const regla = await getPrisma().reglaClasificacionFase.findUnique({ where: { id }, select: { faseOrigen: { select: { torneoCategoriaId: true } } } }); if (!regla) throw noEncontrado('Regla')
    await administrar(regla.faseOrigen.torneoCategoriaId, auth)
    return { data: await actualizarReglaClasificacion(getPrisma(), id, request.body as never, auth.usuarioId) }
  })
  app.get('/fases-competencia/:id/clasificacion/preview', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }
    const fase = await getPrisma().faseCompetencia.findUnique({ where: { id }, select: { torneoCategoria: { select: { torneoId: true } } } }); if (!fase) throw noEncontrado('Fase')
    if (!(await puedeVerTorneo(getPrisma(), auth, fase.torneoCategoria.torneoId))) throw prohibido('No tenés acceso a esa fase')
    return { data: await previsualizarClasificacion(getPrisma(), id) }
  })
  app.post('/fases-competencia/:id/clasificar', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { confirmar?: boolean }
    if (body.confirmar !== true) throw badRequest('La clasificación requiere confirmar: true')
    const fase = await getPrisma().faseCompetencia.findUnique({ where: { id }, select: { torneoCategoriaId: true } }); if (!fase) throw noEncontrado('Fase')
    await administrar(fase.torneoCategoriaId, auth)
    return { data: await clasificarFase(getPrisma(), id, auth.usuarioId) }
  })
  app.post('/fases-competencia/:id/invalidar-clasificacion', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { confirmar?: boolean }
    if (body.confirmar !== true) throw badRequest('La invalidación requiere confirmar: true')
    const fase = await getPrisma().faseCompetencia.findUnique({ where: { id }, select: { torneoCategoriaId: true } }); if (!fase) throw noEncontrado('Fase')
    await administrar(fase.torneoCategoriaId, auth)
    return { data: await invalidarClasificacion(getPrisma(), id, auth.usuarioId) }
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
  app.patch('/rondas-eliminatorias/:id/configuracion', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }
    const ronda = await getPrisma().rondaEliminatoria.findUnique({ where: { id }, select: { faseCompetencia: { select: { torneoCategoriaId: true } } } }); if (!ronda) throw noEncontrado('Ronda')
    await administrar(ronda.faseCompetencia.torneoCategoriaId, auth)
    return { data: await configurarRonda(getPrisma(), id, request.body as { formatoSerie: 'PARTIDO_UNICO' | 'IDA_VUELTA'; permiteAlargue: boolean; permitePenales: boolean }, auth.usuarioId) }
  })
  app.get('/llaves-competencia/:id/resumen', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }
    const llave = await getPrisma().llaveCompetencia.findUnique({ where: { id }, select: { rondaEliminatoria: { select: { faseCompetencia: { select: { torneoCategoria: { select: { torneoId: true } } } } } } } }); if (!llave) throw noEncontrado('Llave')
    if (!(await puedeVerTorneo(getPrisma(), auth, llave.rondaEliminatoria.faseCompetencia.torneoCategoria.torneoId))) throw prohibido('No tenés acceso a esta llave')
    return { data: await resumenLlave(getPrisma(), id) }
  })
  app.post('/llaves-competencia/:id/definicion/:tipo', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id, tipo } = request.params as { id: string; tipo: 'penales' | 'administrativa' }; const body = request.body as { confirmar?: boolean; penalesLocal?: number; penalesVisitante?: number; ganadorParticipacionId?: string; motivo?: string }
    if (body.confirmar !== true) throw badRequest('La definición requiere confirmar: true')
    const llave = await getPrisma().llaveCompetencia.findUnique({ where: { id }, select: { rondaEliminatoria: { select: { faseCompetencia: { select: { torneoCategoriaId: true } } } } } }); if (!llave) throw noEncontrado('Llave')
    await administrar(llave.rondaEliminatoria.faseCompetencia.torneoCategoriaId, auth)
    if (!['penales', 'administrativa'].includes(tipo)) throw badRequest('Tipo de definición inválido')
    return { data: await definirLlave(getPrisma(), id, { ...body, tipo: tipo === 'penales' ? 'PENALES' : 'ADMINISTRATIVA' }, auth.usuarioId) }
  })
  app.post('/llaves-competencia/:id/invalidar-resolucion', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { confirmar?: boolean }
    if (body.confirmar !== true) throw badRequest('La invalidación requiere confirmar: true')
    const llave = await getPrisma().llaveCompetencia.findUnique({ where: { id }, select: { rondaEliminatoria: { select: { faseCompetencia: { select: { torneoCategoriaId: true } } } } } }); if (!llave) throw noEncontrado('Llave')
    await administrar(llave.rondaEliminatoria.faseCompetencia.torneoCategoriaId, auth)
    return { data: await invalidarResolucionLlave(getPrisma(), id, auth.usuarioId) }
  })
  app.post('/llaves-competencia/:id/recalcular', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const body = request.body as { confirmar?: boolean }
    if (body.confirmar !== true) throw badRequest('El recálculo requiere confirmar: true')
    const llave = await getPrisma().llaveCompetencia.findUnique({ where: { id }, select: { rondaEliminatoria: { select: { faseCompetencia: { select: { torneoCategoriaId: true } } } } } }); if (!llave) throw noEncontrado('Llave')
    await administrar(llave.rondaEliminatoria.faseCompetencia.torneoCategoriaId, auth)
    return { data: await recalcularLlave(getPrisma(), id, auth.usuarioId) }
  })
  app.get('/torneo-categorias/:id/competencia-avanzada', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const tc = await getPrisma().torneoCategoria.findUnique({ where: { id }, select: { torneoId: true } }); if (!tc) throw noEncontrado('Competición'); if (!(await puedeVerTorneo(getPrisma(), auth, tc.torneoId))) throw prohibido('No tenés acceso a esa competición')
    const fases = await getPrisma().faseCompetencia.findMany({
      where: { torneoCategoriaId: id },
      include: {
        participantesFase: { include: { participacion: { include: { equipo: { select: { id: true, nombre: true, escudoUrl: true } } } }, clasificadoOrigen: true } },
        reglasClasificacionOrigen: { include: { clasificados: true } },
        grupos: { include: { participaciones: { include: { equipo: { select: { id: true, nombre: true } } } } } },
        rondas: { include: { llaves: { include: { participacionLocal: { select: { id: true, equipoId: true, equipo: { select: { nombre: true, escudoUrl: true } } } }, participacionVisitante: { select: { id: true, equipoId: true, equipo: { select: { nombre: true, escudoUrl: true } } } }, ganadorParticipacion: { select: { id: true, equipoId: true, equipo: { select: { nombre: true, escudoUrl: true } } } }, definicion: true, partidos: { orderBy: { ordenSerie: 'asc' } } } } } },
      },
      orderBy: { orden: 'asc' },
    })
    return { data: fases }
  })
  app.get('/fases-competencia/:id/grupos/:grupoId/tabla', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request); const { id, grupoId } = request.params as { id: string; grupoId: string }; const fase = await getPrisma().faseCompetencia.findUnique({ where: { id }, select: { torneoCategoria: { select: { torneoId: true } } } }); if (!fase) throw noEncontrado('Fase'); if (!(await puedeVerTorneo(getPrisma(), auth, fase.torneoCategoria.torneoId))) throw prohibido('No tenés acceso a esa fase')
    return { data: await tablaGrupo(getPrisma(), id, grupoId) }
  })
}
