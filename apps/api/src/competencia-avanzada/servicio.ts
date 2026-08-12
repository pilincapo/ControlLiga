import type { PrismaClient } from '../generated/prisma/client.js'
import { auditar } from '../auth/auditoria.js'
import { calcularRondas, calcularTabla, leerReglas } from '../fixture/servicio.js'
import { badRequest, conflicto } from '../http.js'

type Db = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
type GrupoEntrada = { nombre: string; participacionIds: string[] }
type SeedEntrada = { participacionId: string; seed: number }
type ReglaEntrada = { faseDestinoId: string; orden: number; tipo: 'POSICION_GRUPO' | 'MEJORES_ENTRE_GRUPOS' | 'POSICION_GENERAL'; posicionDesde: number; posicionHasta: number; cantidad?: number; grupoCompetenciaId?: string; seedTipo: 'ORDEN_CLASIFICACION' | 'CRUCE_EXPLICITO'; seedInicio: number; configuracion?: Record<string, unknown> }
type FaseGenerable = { id: string; torneoCategoriaId: string; configuracion: unknown; grupos: Array<{ id: string; nombre: string; participaciones: Array<{ equipoId: string }> }>; participantesFase: Array<{ id: string; participacionId: string; seed: number | null; participacion: { equipoId: string } }>; torneoCategoria: { torneoId: string; temporadaId: string } }
type LlaveCarga = { id: string; estado: string; ganadorParticipacionId: string | null; llaveSiguienteId: string | null; ladoSiguiente: string | null; participacionLocalId: string | null; participacionVisitanteId: string | null; partidos: Array<{ id: string }>; rondaEliminatoria: { faseCompetencia: { torneoCategoriaId: string; torneoCategoria: { torneoId: string; temporadaId: string } } } }

function siguientePotenciaDos(cantidad: number) {
  let valor = 1
  while (valor < cantidad) valor *= 2
  return valor
}

function nombreRonda(tamano: number) {
  return tamano === 2 ? 'FINAL' : tamano === 4 ? 'SEMIFINAL' : tamano === 8 ? 'CUARTOS' : tamano === 16 ? 'OCTAVOS' : `RONDA_DE_${tamano}`
}

async function competencia(db: Db, torneoCategoriaId: string) {
  const resultado = await db.torneoCategoria.findUnique({ where: { id: torneoCategoriaId }, include: { configuracion: true, temporada: true } })
  if (!resultado) throw badRequest('La competición no existe')
  if (!['BORRADOR', 'PUBLICADO'].includes(resultado.temporada.estado)) throw conflicto('temporada_no_generable', 'La fase solo puede generarse en una temporada borrador o publicada')
  return resultado
}

export async function crearFaseGrupos(db: PrismaClient, datos: { torneoCategoriaId: string; orden: number; nombre: string; grupos: GrupoEntrada[]; ruedas: number; usuarioId: string }) {
  if (!Number.isInteger(datos.orden) || datos.orden < 1 || ![1, 2].includes(datos.ruedas) || datos.grupos.length < 2) throw badRequest('Configuración de grupos inválida')
  const ids = datos.grupos.flatMap((grupo) => grupo.participacionIds)
  if (new Set(ids).size !== ids.length || datos.grupos.some((grupo) => !grupo.nombre.trim() || grupo.participacionIds.length < 2)) throw badRequest('Los grupos requieren al menos dos participaciones únicas')
  const tc = await competencia(db, datos.torneoCategoriaId)
  const participaciones = await db.equipoParticipacion.findMany({ where: { id: { in: ids }, torneoCategoriaId: datos.torneoCategoriaId, estado: 'CONFIRMADO' }, select: { id: true, grupoCompetenciaId: true } })
  if (participaciones.length !== ids.length || participaciones.some((p) => p.grupoCompetenciaId)) throw badRequest('Las participaciones deben ser confirmadas y no estar asignadas a otro grupo')
  const reglas = leerReglas(tc.configuracion ?? { sistemaPuntos: null, desempates: null })
  return db.$transaction(async (tx) => {
    const fase = await tx.faseCompetencia.create({ data: { torneoCategoriaId: datos.torneoCategoriaId, orden: datos.orden, nombre: datos.nombre.trim(), tipo: 'GRUPOS', configuracion: { ruedas: datos.ruedas, cantidadGrupos: datos.grupos.length }, sistemaPuntos: reglas.sistemaPuntos as never, desempates: reglas.desempates as never } })
    for (let i = 0; i < datos.grupos.length; i++) {
      const grupo = datos.grupos[i]!
      const creado = await tx.grupoCompetencia.create({ data: { faseCompetenciaId: fase.id, orden: i + 1, nombre: grupo.nombre.trim() } })
      await tx.equipoParticipacion.updateMany({ where: { id: { in: grupo.participacionIds } }, data: { grupoCompetenciaId: creado.id } })
    }
    await auditar(tx, { entidad: 'FaseCompetencia', entidadId: fase.id, accion: 'CREATE', usuarioId: datos.usuarioId, cambios: { tipo: 'GRUPOS', grupos: datos.grupos.map((g) => ({ nombre: g.nombre, cantidad: g.participacionIds.length })) } })
    return fase
  }, { isolationLevel: 'Serializable' })
}

export async function crearFaseEliminacion(db: PrismaClient, datos: { torneoCategoriaId: string; orden: number; nombre: string; seeds: SeedEntrada[]; usuarioId: string }) {
  if (!Number.isInteger(datos.orden) || datos.orden < 1 || datos.seeds.length < 4 || datos.seeds.length > 16) throw badRequest('La eliminación requiere entre 4 y 16 seeds')
  const ids = datos.seeds.map((seed) => seed.participacionId)
  const seeds = datos.seeds.map((seed) => seed.seed)
  if (new Set(ids).size !== ids.length || new Set(seeds).size !== seeds.length || seeds.some((seed) => !Number.isInteger(seed) || seed < 1) || !seeds.every((seed, i) => seed === i + 1)) throw badRequest('Los seeds deben ser únicos, enteros y completos desde 1')
  await competencia(db, datos.torneoCategoriaId)
  const participaciones = await db.equipoParticipacion.count({ where: { id: { in: ids }, torneoCategoriaId: datos.torneoCategoriaId, estado: 'CONFIRMADO' } })
  if (participaciones !== ids.length) throw badRequest('Todos los seeds deben ser participaciones confirmadas de la competición')
  const fase = await db.faseCompetencia.create({ data: { torneoCategoriaId: datos.torneoCategoriaId, orden: datos.orden, nombre: datos.nombre.trim(), tipo: 'ELIMINACION_DIRECTA', configuracion: { seeds: datos.seeds } } })
  await auditar(db, { entidad: 'FaseCompetencia', entidadId: fase.id, accion: 'CREATE', usuarioId: datos.usuarioId, cambios: { tipo: 'ELIMINACION_DIRECTA', seeds: datos.seeds } })
  return fase
}

export async function generarFase(db: PrismaClient, faseId: string, usuarioId: string) {
  const fase = await db.faseCompetencia.findUnique({ where: { id: faseId }, include: { torneoCategoria: { include: { temporada: true } }, grupos: { include: { participaciones: { include: { equipo: true } } } }, participantesFase: { include: { participacion: true }, orderBy: { seed: 'asc' } }, rondas: true } })
  if (!fase) throw badRequest('La fase no existe')
  if (fase.estado !== 'BORRADOR' || fase.rondas.length) throw conflicto('fase_existente', 'La fase ya fue generada')
  if (!['BORRADOR', 'PUBLICADO'].includes(fase.torneoCategoria.temporada.estado)) throw conflicto('temporada_no_generable', 'La fase no puede generarse en esta temporada')
  if (fase.tipo === 'GRUPOS') return generarGrupos(db, fase as unknown as FaseGenerable, usuarioId)
  if (fase.tipo === 'ELIMINACION_DIRECTA') return generarEliminacion(db, fase as unknown as FaseGenerable, usuarioId)
  if (fase.tipo === 'LIGA') return generarLiga(db, fase as unknown as FaseGenerable, usuarioId)
  throw badRequest('Tipo de fase inválido')
}

async function generarLiga(db: PrismaClient, fase: FaseGenerable, usuarioId: string) {
  const participantes = await db.participanteFase.findMany({ where: { faseCompetenciaId: fase.id }, include: { participacion: true }, orderBy: { seed: 'asc' } })
  const ruedas = (fase.configuracion as { ruedas?: number }).ruedas
  if (![1, 2].includes(ruedas ?? 0) || participantes.length < 2) throw badRequest('Liga requiere participantes y ruedas válidas')
  return db.$transaction(async (tx) => {
    let cantidadPartidos = 0
    for (const [indice, ronda] of calcularRondas(participantes.map((p) => p.participacion.equipoId), ruedas!).entries()) {
        const jornada = await tx.jornada.create({ data: { torneoCategoriaId: fase.torneoCategoriaId, faseCompetenciaId: fase.id, numero: indice + 1, nombre: `Liga - Jornada ${indice + 1}` } })
      for (const [local, visitante] of ronda) {
        if (!visitante) { await tx.jornadaEquipoDescanso.create({ data: { jornadaId: jornada.id, equipoId: local, motivo: 'DESCANSO_AUTOMATICO' } }); continue }
        await tx.partido.create({ data: { tipo: 'OFICIAL', torneoId: fase.torneoCategoria.torneoId, temporadaId: fase.torneoCategoria.temporadaId, torneoCategoriaId: fase.torneoCategoriaId, jornadaId: jornada.id, equipoLocalId: local, equipoVisitanteId: visitante, equipoResponsableId: local, fechaHora: new Date() } })
        cantidadPartidos++
      }
    }
    const actualizada = await tx.faseCompetencia.update({ where: { id: fase.id }, data: { estado: 'GENERADA' } })
    await auditar(tx, { entidad: 'FaseCompetencia', entidadId: fase.id, accion: 'UPDATE', usuarioId, cambios: { operacion: 'generar_liga', cantidadPartidos } })
    return { fase: actualizada, cantidadPartidos }
  }, { isolationLevel: 'Serializable' })
}

async function generarGrupos(db: PrismaClient, fase: FaseGenerable, usuarioId: string) {
  const configuracion = fase.configuracion as { ruedas?: number }
  const ruedas = configuracion.ruedas
  if (![1, 2].includes(ruedas ?? 0) || fase.grupos.length < 2) throw badRequest('Configuración de grupos inválida')
  return db.$transaction(async (tx) => {
    let cantidadPartidos = 0
    for (const grupo of fase.grupos) {
      if (grupo.participaciones.length < 2) throw badRequest('Cada grupo requiere dos participaciones')
      const rondas = calcularRondas(grupo.participaciones.map((p) => p.equipoId), ruedas!)
      for (let i = 0; i < rondas.length; i++) {
        const jornada = await tx.jornada.create({ data: { torneoCategoriaId: fase.torneoCategoriaId, grupoCompetenciaId: grupo.id, numero: i + 1, nombre: `Grupo ${grupo.nombre} - Jornada ${i + 1}` } })
        for (const [local, visitante] of rondas[i]!) {
          if (!visitante) { await tx.jornadaEquipoDescanso.create({ data: { jornadaId: jornada.id, equipoId: local, motivo: 'DESCANSO_AUTOMATICO' } }); continue }
          await tx.partido.create({ data: { tipo: 'OFICIAL', torneoId: fase.torneoCategoria.torneoId, temporadaId: fase.torneoCategoria.temporadaId, torneoCategoriaId: fase.torneoCategoriaId, jornadaId: jornada.id, equipoLocalId: local, equipoVisitanteId: visitante, equipoResponsableId: local, fechaHora: new Date() } })
          cantidadPartidos++
        }
      }
    }
    const actualizada = await tx.faseCompetencia.update({ where: { id: fase.id }, data: { estado: 'GENERADA' } })
    await auditar(tx, { entidad: 'FaseCompetencia', entidadId: fase.id, accion: 'UPDATE', usuarioId, cambios: { operacion: 'generar_grupos', cantidadPartidos } })
    return { fase: actualizada, cantidadPartidos }
  }, { isolationLevel: 'Serializable' })
}

async function generarEliminacion(db: Db, fase: FaseGenerable, usuarioId: string, enTransaccion = false) {
  const semillasConfiguradas = (fase.configuracion as { seeds?: SeedEntrada[] }).seeds
  const semillas = semillasConfiguradas ?? fase.participantesFase.map((participante, indice) => ({ participacionId: participante.participacionId, seed: participante.seed ?? indice + 1 }))
  if (!semillas || semillas.length < 4) throw badRequest('Seeds inválidos')
  const tamano = siguientePotenciaDos(semillas.length)
  const ejecutar = async (tx: Db) => {
    const rondas = [] as Array<{ id: string; tamano: number }>
    for (let tam = tamano, orden = 1; tam >= 2; tam /= 2, orden++) rondas.push({ ...(await tx.rondaEliminatoria.create({ data: { faseCompetenciaId: fase.id, orden, nombre: nombreRonda(tam) } })), tamano: tam })
    const primera = rondas[0]!
    const ordenadas = [...semillas].sort((a, b) => a.seed - b.seed)
    const porSeed = new Map(ordenadas.map((seed) => [seed.seed, seed.participacionId]))
    const participantePorParticipacion = new Map(fase.participantesFase.map((participante) => [participante.participacionId, participante.id]))
    const llaves: Array<{ id: string; orden: number }> = []
    for (let i = 0; i < tamano / 2; i++) {
      const a = i + 1, b = tamano - i
      const local = porSeed.get(a) ?? null, visitante = porSeed.get(b) ?? null
      const llave = await tx.llaveCompetencia.create({ data: { rondaEliminatoriaId: primera.id, orden: i + 1, participacionLocalId: local, participacionVisitanteId: visitante, participanteFaseLocalId: local ? participantePorParticipacion.get(local) : null, participanteFaseVisitanteId: visitante ? participantePorParticipacion.get(visitante) : null, seedLocal: local ? a : null, seedVisitante: visitante ? b : null, origenLocalTipo: local ? 'SEED' : null, origenVisitanteTipo: visitante ? 'SEED' : null, estado: local && visitante ? 'PROGRAMADA' : local || visitante ? 'BYE' : 'PENDIENTE_PARTICIPANTES', ganadorParticipacionId: local && !visitante ? local : visitante && !local ? visitante : null, metodoResolucion: local && !visitante || visitante && !local ? 'BYE' : null } })
      llaves.push(llave)
      if (local && visitante) {
        const [participacionLocal, participacionVisitante] = await Promise.all([tx.equipoParticipacion.findUniqueOrThrow({ where: { id: local } }), tx.equipoParticipacion.findUniqueOrThrow({ where: { id: visitante } })])
        await tx.partido.create({ data: { tipo: 'OFICIAL', torneoId: fase.torneoCategoria.torneoId, temporadaId: fase.torneoCategoria.temporadaId, torneoCategoriaId: fase.torneoCategoriaId, llaveCompetenciaId: llave.id, equipoLocalId: participacionLocal.equipoId, equipoVisitanteId: participacionVisitante.equipoId, equipoResponsableId: participacionLocal.equipoId, fechaHora: new Date() } })
      }
    }
    let anteriores = llaves
    for (let r = 1; r < rondas.length; r++) {
      const actuales: Array<{ id: string; orden: number }> = []
      for (let i = 0; i < anteriores.length; i += 2) {
        const llave = await tx.llaveCompetencia.create({ data: { rondaEliminatoriaId: rondas[r]!.id, orden: i / 2 + 1, origenLocalTipo: 'GANADOR_LLAVE', origenLocalLlaveId: anteriores[i]!.id, origenVisitanteTipo: 'GANADOR_LLAVE', origenVisitanteLlaveId: anteriores[i + 1]!.id, estado: 'PENDIENTE_PARTICIPANTES' } })
        await tx.llaveCompetencia.update({ where: { id: anteriores[i]!.id }, data: { llaveSiguienteId: llave.id, ladoSiguiente: 'LOCAL' } })
        await tx.llaveCompetencia.update({ where: { id: anteriores[i + 1]!.id }, data: { llaveSiguienteId: llave.id, ladoSiguiente: 'VISITANTE' } })
        actuales.push(llave)
      }
      anteriores = actuales
    }
    for (const llave of llaves) await propagarGanador(tx, llave.id)
    const actualizada = await tx.faseCompetencia.update({ where: { id: fase.id }, data: { estado: 'GENERADA' } })
    await auditar(tx, { entidad: 'FaseCompetencia', entidadId: fase.id, accion: 'UPDATE', usuarioId, cambios: { operacion: 'generar_eliminacion', seeds: semillas, tamano } })
    return { fase: actualizada, cantidadLlaves: tamano - 1 }
  }
  return enTransaccion ? ejecutar(db) : (db as PrismaClient).$transaction(ejecutar, { isolationLevel: 'Serializable' })
}

async function propagarGanador(db: Db, llaveId: string) {
  const llave = await db.llaveCompetencia.findUnique({ where: { id: llaveId }, include: { rondaEliminatoria: { include: { faseCompetencia: { include: { torneoCategoria: true } } } }, partidos: true } }) as unknown as LlaveCarga | null
  if (!llave || !llave.ganadorParticipacionId || !llave.llaveSiguienteId) return
  const siguiente = await db.llaveCompetencia.findUnique({ where: { id: llave.llaveSiguienteId }, include: { partidos: true } }) as unknown as Pick<LlaveCarga, 'id' | 'estado' | 'partidos'> | null
  if (!siguiente || siguiente.partidos.length || siguiente.estado !== 'PENDIENTE_PARTICIPANTES') return
  await db.llaveCompetencia.update({ where: { id: siguiente.id }, data: llave.ladoSiguiente === 'LOCAL' ? { participacionLocalId: llave.ganadorParticipacionId } : { participacionVisitanteId: llave.ganadorParticipacionId } })
  const actualizada = await db.llaveCompetencia.findUniqueOrThrow({ where: { id: siguiente.id } })
  if (!actualizada.participacionLocalId || !actualizada.participacionVisitanteId) return
  const local = await db.equipoParticipacion.findUniqueOrThrow({ where: { id: actualizada.participacionLocalId } })
  const visitante = await db.equipoParticipacion.findUniqueOrThrow({ where: { id: actualizada.participacionVisitanteId } })
  await db.llaveCompetencia.update({ where: { id: siguiente.id }, data: { estado: 'PROGRAMADA' } })
  await db.partido.create({ data: { tipo: 'OFICIAL', torneoId: llave.rondaEliminatoria.faseCompetencia.torneoCategoria.torneoId, temporadaId: llave.rondaEliminatoria.faseCompetencia.torneoCategoria.temporadaId, torneoCategoriaId: llave.rondaEliminatoria.faseCompetencia.torneoCategoriaId, llaveCompetenciaId: siguiente.id, equipoLocalId: local.equipoId, equipoVisitanteId: visitante.equipoId, equipoResponsableId: local.equipoId, fechaHora: new Date() } })
}

export async function actualizarLlavePorPartidoFinalizado(db: PrismaClient, partidoId: string) {
  const partido = await db.partido.findUnique({ where: { id: partidoId }, select: { llaveCompetenciaId: true, estado: true, golesLocal: true, golesVisitante: true } })
  if (!partido?.llaveCompetenciaId || partido.estado !== 'FINALIZADO' || partido.golesLocal === null || partido.golesVisitante === null) return
  const llaveCompetenciaId = partido.llaveCompetenciaId
  const golesLocal = partido.golesLocal
  const golesVisitante = partido.golesVisitante
  await db.$transaction(async (tx) => {
    const llave = await tx.llaveCompetencia.findUniqueOrThrow({ where: { id: llaveCompetenciaId }, include: { partidos: true } }) as unknown as LlaveCarga
    if (llave.partidos.length !== 1 || llave.estado !== 'PROGRAMADA') return
    if (golesLocal === golesVisitante) { await tx.llaveCompetencia.update({ where: { id: llave.id }, data: { estado: 'PENDIENTE_DEFINICION' } }); return }
    const ganador = golesLocal > golesVisitante ? llave.participacionLocalId : llave.participacionVisitanteId
    if (!ganador) return
    await tx.llaveCompetencia.update({ where: { id: llave.id }, data: { estado: 'RESUELTA', ganadorParticipacionId: ganador, metodoResolucion: 'RESULTADO_PARTIDO' } })
    await propagarGanador(tx, llave.id)
  }, { isolationLevel: 'Serializable' })
}

export async function tablaGrupo(db: PrismaClient, faseId: string, grupoId: string) {
  const grupo = await db.grupoCompetencia.findFirst({ where: { id: grupoId, faseCompetenciaId: faseId }, include: { faseCompetencia: true, participaciones: { include: { equipo: { select: { id: true, nombre: true, escudoUrl: true } } } } } })
  if (!grupo) throw badRequest('El grupo no pertenece a la fase')
  const reglas = leerReglas({ sistemaPuntos: grupo.faseCompetencia.sistemaPuntos, desempates: grupo.faseCompetencia.desempates })
  const partidos = await db.partido.findMany({ where: { jornada: { grupoCompetenciaId: grupo.id }, tipo: 'OFICIAL', estado: 'FINALIZADO' }, select: { equipoLocalId: true, equipoVisitanteId: true, golesLocal: true, golesVisitante: true } })
  return calcularTabla(grupo.participaciones.map((p) => p.equipo), partidos, reglas)
}

export async function crearReglaClasificacion(db: PrismaClient, faseOrigenId: string, datos: ReglaEntrada, usuarioId: string) {
  if (!Number.isInteger(datos.orden) || datos.orden < 1 || !Number.isInteger(datos.posicionDesde) || datos.posicionDesde < 1 || datos.posicionHasta < datos.posicionDesde || !Number.isInteger(datos.seedInicio) || datos.seedInicio < 1) throw badRequest('Regla de clasificación inválida')
  const [origen, destino] = await Promise.all([db.faseCompetencia.findUnique({ where: { id: faseOrigenId } }), db.faseCompetencia.findUnique({ where: { id: datos.faseDestinoId }, include: { grupos: true, rondas: true, participantesFase: true } })])
  if (!origen || !destino || origen.torneoCategoriaId !== destino.torneoCategoriaId || origen.id === destino.id || origen.estado !== 'BORRADOR') throw badRequest('Fases de clasificación inválidas')
  if (destino.estado !== 'BORRADOR' || destino.grupos.length || destino.rondas.length || destino.participantesFase.length) throw conflicto('fase_destino_bloqueada', 'La fase destino no está virgen')
  if (datos.tipo === 'POSICION_GRUPO' && !datos.grupoCompetenciaId) throw badRequest('La posición de grupo requiere grupo')
  if (datos.grupoCompetenciaId && !(await db.grupoCompetencia.findFirst({ where: { id: datos.grupoCompetenciaId, faseCompetenciaId: faseOrigenId } }))) throw badRequest('Grupo de origen inválido')
  const regla = await db.reglaClasificacionFase.create({ data: { faseOrigenId, ...datos, configuracion: (datos.configuracion ?? {}) as never } })
  await auditar(db as never, { entidad: 'ReglaClasificacionFase', entidadId: regla.id, accion: 'CREATE', usuarioId, cambios: { faseOrigenId, faseDestinoId: datos.faseDestinoId, tipo: datos.tipo } })
  return regla
}

export async function actualizarReglaClasificacion(db: PrismaClient, reglaId: string, datos: ReglaEntrada, usuarioId: string) {
  const regla = await db.reglaClasificacionFase.findUnique({ where: { id: reglaId }, include: { clasificados: true, faseOrigen: true } })
  if (!regla) throw badRequest('La regla no existe')
  if (regla.estado !== 'BORRADOR' || regla.clasificados.length || regla.faseOrigen.estado !== 'BORRADOR') throw conflicto('regla_bloqueada', 'La regla solo puede modificarse en borrador sin materialización')
  if (!Number.isInteger(datos.posicionDesde) || datos.posicionDesde < 1 || datos.posicionHasta < datos.posicionDesde || !Number.isInteger(datos.seedInicio) || datos.seedInicio < 1 || (datos.tipo === 'POSICION_GRUPO' && !datos.grupoCompetenciaId)) throw badRequest('Regla de clasificación inválida')
  if (datos.grupoCompetenciaId && !(await db.grupoCompetencia.findFirst({ where: { id: datos.grupoCompetenciaId, faseCompetenciaId: regla.faseOrigenId } }))) throw badRequest('Grupo de origen inválido')
  const actualizada = await db.reglaClasificacionFase.update({ where: { id: regla.id }, data: { tipo: datos.tipo, posicionDesde: datos.posicionDesde, posicionHasta: datos.posicionHasta, cantidad: datos.cantidad, grupoCompetenciaId: datos.grupoCompetenciaId, seedTipo: datos.seedTipo, seedInicio: datos.seedInicio, configuracion: (datos.configuracion ?? {}) as never } })
  await auditar(db, { entidad: 'ReglaClasificacionFase', entidadId: actualizada.id, accion: 'UPDATE', usuarioId, cambios: { operacion: 'actualizar_regla' } })
  return actualizada
}

type Candidato = { reglaId: string; participacionId: string; posicion: number; seed: number; etiquetaOrigen: string; tablaSnapshot: unknown; desempatesSnapshot: unknown }

async function candidatosClasificacion(db: Db, faseId: string) {
  const fase = await db.faseCompetencia.findUnique({
    where: { id: faseId },
    include: {
      grupos: { include: { participaciones: { include: { equipo: { select: { id: true, nombre: true, escudoUrl: true } } } } }, orderBy: { orden: 'asc' } },
      reglasClasificacionOrigen: { where: { estado: { in: ['BORRADOR', 'CLASIFICADA'] } }, orderBy: { orden: 'asc' } },
      participantesFase: { include: { participacion: { include: { equipo: { select: { id: true, nombre: true, escudoUrl: true } } } } } },
    },
  })
  if (!fase) throw badRequest('La fase no existe')
  if (!['GENERADA', 'FINALIZADA'].includes(fase.estado)) throw conflicto('fase_origen_incompleta', 'La fase origen debe estar generada o finalizada')
  const partidos = await db.partido.findMany({ where: fase.tipo === 'GRUPOS' ? { jornada: { grupoCompetencia: { faseCompetenciaId: fase.id } } } : { jornada: { faseCompetenciaId: fase.id } }, select: { equipoLocalId: true, equipoVisitanteId: true, golesLocal: true, golesVisitante: true, estado: true } })
  if (partidos.some((p) => p.estado !== 'FINALIZADO' || p.golesLocal === null || p.golesVisitante === null)) throw conflicto('fase_origen_incompleta', 'Todos los partidos de origen deben finalizar')
  const reglas = leerReglas({ sistemaPuntos: fase.sistemaPuntos, desempates: fase.desempates })
  const tabla = (participaciones: Array<{ id: string; equipo: { id: string; nombre: string; escudoUrl: string | null } }>) => calcularTabla(participaciones.map((p) => p.equipo), partidos.filter((partido) => participaciones.some((p) => p.equipo.id === partido.equipoLocalId) && participaciones.some((p) => p.equipo.id === partido.equipoVisitanteId)), reglas)
  const grupos = new Map(fase.grupos.map((g) => [g.id, { grupo: g, tabla: tabla(g.participaciones) }]))
  const generales = fase.tipo === 'LIGA' ? fase.participantesFase.map((p) => p.participacion) : fase.grupos.flatMap((g) => g.participaciones)
  const general = tabla(generales)
  const resultado: Candidato[] = []
  for (const regla of fase.reglasClasificacionOrigen) {
    let filas: Array<{ equipo: { id: string }; posicion?: number }> = []
    if (regla.tipo === 'POSICION_GRUPO') filas = (grupos.get(regla.grupoCompetenciaId!)?.tabla.filas ?? []).filter((f) => f.posicion! >= regla.posicionDesde && f.posicion! <= regla.posicionHasta)
    if (regla.tipo === 'POSICION_GENERAL') filas = general.filas.filter((f) => f.posicion! >= regla.posicionDesde && f.posicion! <= regla.posicionHasta)
    if (regla.tipo === 'MEJORES_ENTRE_GRUPOS') {
      const comparables = [...grupos.values()]
      const tamaños = new Set(comparables.map((g) => g.grupo.participaciones.length))
      if (tamaños.size !== 1) throw conflicto('clasificacion_grupos_no_comparables', 'Los grupos comparados no tienen igual cantidad de participantes')
      filas = comparables.flatMap((g) => g.tabla.filas.filter((f) => f.posicion! >= regla.posicionDesde && f.posicion! <= regla.posicionHasta)).sort((a, b) => b.PTS - a.PTS || b.DG - a.DG || b.GF - a.GF).slice(0, regla.cantidad ?? 0)
    }
    const esperada = regla.tipo === 'MEJORES_ENTRE_GRUPOS' ? regla.cantidad : regla.posicionHasta - regla.posicionDesde + 1
    if (filas.length !== esperada) throw conflicto('clasificacion_incompleta', 'La regla no produjo cantidad esperada')
    const configuracion = regla.configuracion as { seed?: unknown; seeds?: unknown }
    const seedsExplicitos = Array.isArray(configuracion.seeds) && configuracion.seeds.every((seed) => Number.isInteger(seed) && (seed as number) > 0) ? configuracion.seeds as number[] : undefined
    if (regla.seedTipo === 'CRUCE_EXPLICITO' && !seedsExplicitos && (!Number.isInteger(configuracion.seed) || (configuracion.seed as number) < 1)) throw badRequest('Cruce explícito requiere seed o seeds válidos')
    for (const [indice, fila] of filas.entries()) {
      const participacion = generales.find((p) => p.equipoId === fila.equipo.id)
      if (!participacion) throw badRequest('Participación de clasificación inválida')
      const seed = seedsExplicitos?.[indice] ?? (regla.seedTipo === 'CRUCE_EXPLICITO' ? configuracion.seed as number : regla.seedInicio + indice)
      if (!Number.isInteger(seed) || seed < 1) throw badRequest('Cruce explícito incompleto')
      resultado.push({ reglaId: regla.id, participacionId: participacion.id, posicion: fila.posicion ?? indice + 1, seed, etiquetaOrigen: `Posición ${fila.posicion ?? indice + 1}`, tablaSnapshot: fila, desempatesSnapshot: reglas })
    }
  }
  if (new Set(resultado.map((r) => r.participacionId)).size !== resultado.length) throw conflicto('clasificacion_duplicada', 'Una participación clasifica más de una vez')
  return { fase, candidatos: resultado }
}

export async function previsualizarClasificacion(db: PrismaClient, faseId: string) { return candidatosClasificacion(db, faseId) }

export async function clasificarFase(db: PrismaClient, faseId: string, usuarioId: string) {
  return db.$transaction(async (tx) => {
    const previo = await tx.reglaClasificacionFase.findMany({ where: { faseOrigenId: faseId, estado: 'CLASIFICADA' }, include: { clasificados: true } })
    if (previo.length) return { idempotente: true, clasificados: previo.flatMap((r) => r.clasificados) }
    const { fase, candidatos } = await candidatosClasificacion(tx, faseId)
    const destinos = new Set((await tx.reglaClasificacionFase.findMany({ where: { faseOrigenId: faseId }, select: { faseDestinoId: true } })).map((r) => r.faseDestinoId))
    for (const destinoId of destinos) {
      const destino = await tx.faseCompetencia.findUniqueOrThrow({ where: { id: destinoId }, include: { grupos: true, rondas: true, participantesFase: true } })
      if (destino.estado !== 'BORRADOR' || destino.grupos.length || destino.rondas.length || destino.participantesFase.length) throw conflicto('fase_destino_bloqueada', 'La fase destino no está virgen')
    }
    const clasificados = []
    for (const candidato of candidatos) clasificados.push(await tx.clasificadoFase.create({ data: { reglaClasificacionId: candidato.reglaId, participacionId: candidato.participacionId, posicion: candidato.posicion, seed: candidato.seed, etiquetaOrigen: candidato.etiquetaOrigen, tablaSnapshot: candidato.tablaSnapshot as never, desempatesSnapshot: candidato.desempatesSnapshot as never } }))
    const reglas = await tx.reglaClasificacionFase.findMany({ where: { faseOrigenId: faseId } })
    for (const clasificado of clasificados) {
      const regla = reglas.find((r) => r.id === clasificado.reglaClasificacionId)!
      await tx.participanteFase.create({ data: { faseCompetenciaId: regla.faseDestinoId, participacionId: clasificado.participacionId, clasificadoOrigenId: clasificado.id, seed: clasificado.seed } })
    }
    await tx.reglaClasificacionFase.updateMany({ where: { faseOrigenId: faseId }, data: { estado: 'CLASIFICADA' } })
    for (const destinoId of destinos) {
      const destino = await tx.faseCompetencia.findUniqueOrThrow({ where: { id: destinoId }, include: { grupos: { include: { participaciones: true } }, participantesFase: { include: { participacion: true }, orderBy: { seed: 'asc' } }, torneoCategoria: true } })
      if (destino.tipo !== 'ELIMINACION_DIRECTA') throw badRequest('La clasificación automática solo admite destino de eliminación directa')
      await generarEliminacion(tx, destino as unknown as FaseGenerable, usuarioId, true)
    }
    await auditar(tx, { entidad: 'FaseCompetencia', entidadId: fase.id, accion: 'UPDATE', usuarioId, cambios: { operacion: 'clasificar', cantidad: clasificados.length } })
    return { idempotente: false, clasificados }
  }, { isolationLevel: 'Serializable' })
}

export async function invalidarClasificacion(db: PrismaClient, faseId: string, usuarioId: string) {
  return db.$transaction(async (tx) => {
    const reglas = await tx.reglaClasificacionFase.findMany({ where: { faseOrigenId: faseId, estado: 'CLASIFICADA' }, include: { clasificados: true } })
    if (!reglas.length) throw conflicto('clasificacion_inexistente', 'No existe clasificación materializada')
    const destinos = [...new Set(reglas.map((r) => r.faseDestinoId))]
    const pendientes = [...destinos]
    const arbol = new Set(destinos)
    while (pendientes.length) {
      const actual = pendientes.pop()!
      const siguientes = await tx.reglaClasificacionFase.findMany({ where: { faseOrigenId: actual, estado: 'CLASIFICADA' }, select: { faseDestinoId: true } })
      for (const siguiente of siguientes) if (!arbol.has(siguiente.faseDestinoId)) { arbol.add(siguiente.faseDestinoId); pendientes.push(siguiente.faseDestinoId) }
    }
    const posteriores = await tx.reglaClasificacionFase.count({ where: { faseOrigenId: { in: [...arbol] }, estado: 'CLASIFICADA' } })
    if (posteriores) throw conflicto('fase_destino_historica', 'Existe clasificación posterior materializada')
    for (const destinoId of destinos) {
      const llaves = await tx.llaveCompetencia.findMany({ where: { rondaEliminatoria: { faseCompetenciaId: destinoId } }, include: { partidos: true } })
      const partidos = await tx.partido.findMany({ where: { OR: [{ jornada: { grupoCompetencia: { faseCompetenciaId: destinoId } } }, { jornada: { faseCompetenciaId: destinoId } }, { llaveCompetencia: { rondaEliminatoria: { faseCompetenciaId: destinoId } } }] } })
      if (llaves.some((l) => ['RESUELTA', 'PENDIENTE_DEFINICION', 'EN_CURSO'].includes(l.estado)) || partidos.some((p) => p.estado !== 'PROGRAMADO' || p.golesLocal !== null || p.golesVisitante !== null || p.publicada)) throw conflicto('fase_destino_historica', 'La fase destino contiene actividad')
      const ids = partidos.map((p) => p.id)
      const actividad = ids.length ? await Promise.all([tx.eventoPartido.count({ where: { partidoId: { in: ids } } }), tx.convocatoria.count({ where: { partidoId: { in: ids } } }), tx.formacionInstancia.count({ where: { partidoId: { in: ids } } }), tx.sancion.count({ where: { partidoId: { in: ids } } })]) : [0]
      if (actividad.some(Boolean)) throw conflicto('fase_destino_historica', 'La fase destino contiene dependencias históricas')
      await tx.partido.deleteMany({ where: { id: { in: ids } } })
      await tx.jornadaEquipoDescanso.deleteMany({ where: { jornada: { OR: [{ grupoCompetencia: { faseCompetenciaId: destinoId } }, { faseCompetenciaId: destinoId }] } } })
      await tx.jornada.deleteMany({ where: { OR: [{ grupoCompetencia: { faseCompetenciaId: destinoId } }, { faseCompetenciaId: destinoId }] } })
      await tx.llaveCompetencia.deleteMany({ where: { rondaEliminatoria: { faseCompetenciaId: destinoId } } })
      await tx.rondaEliminatoria.deleteMany({ where: { faseCompetenciaId: destinoId } })
      await tx.participanteFase.deleteMany({ where: { faseCompetenciaId: destinoId } })
      await tx.faseCompetencia.update({ where: { id: destinoId }, data: { estado: 'BORRADOR' } })
    }
    await tx.clasificadoFase.deleteMany({ where: { reglaClasificacionId: { in: reglas.map((r) => r.id) } } })
    await tx.reglaClasificacionFase.updateMany({ where: { id: { in: reglas.map((r) => r.id) } }, data: { estado: 'INVALIDADA' } })
    await auditar(tx, { entidad: 'FaseCompetencia', entidadId: faseId, accion: 'UPDATE', usuarioId, cambios: { operacion: 'invalidar_clasificacion', destinos } })
    return { destinos }
  }, { isolationLevel: 'Serializable' })
}
