import type { PrismaClient } from '../generated/prisma/client.js'
import { auditar } from '../auth/auditoria.js'
import { calcularRondas, calcularTabla, leerReglas } from '../fixture/servicio.js'
import { badRequest, conflicto } from '../http.js'

type Db = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
type GrupoEntrada = { nombre: string; participacionIds: string[] }
type SeedEntrada = { participacionId: string; seed: number }
type FaseGenerable = { id: string; torneoCategoriaId: string; configuracion: unknown; grupos: Array<{ id: string; nombre: string; participaciones: Array<{ equipoId: string }> }>; torneoCategoria: { torneoId: string; temporadaId: string } }
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
  const fase = await db.faseCompetencia.findUnique({ where: { id: faseId }, include: { torneoCategoria: { include: { temporada: true } }, grupos: { include: { participaciones: { include: { equipo: true } } } }, rondas: true } })
  if (!fase) throw badRequest('La fase no existe')
  if (fase.estado !== 'BORRADOR' || fase.rondas.length) throw conflicto('fase_existente', 'La fase ya fue generada')
  if (!['BORRADOR', 'PUBLICADO'].includes(fase.torneoCategoria.temporada.estado)) throw conflicto('temporada_no_generable', 'La fase no puede generarse en esta temporada')
  if (fase.tipo === 'GRUPOS') return generarGrupos(db, fase as unknown as FaseGenerable, usuarioId)
  if (fase.tipo === 'ELIMINACION_DIRECTA') return generarEliminacion(db, fase as unknown as FaseGenerable, usuarioId)
  throw badRequest('Tipo de fase fuera de alcance FASE 16A')
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

async function generarEliminacion(db: PrismaClient, fase: FaseGenerable, usuarioId: string) {
  const semillas = (fase.configuracion as { seeds?: SeedEntrada[] }).seeds
  if (!semillas || semillas.length < 4) throw badRequest('Seeds inválidos')
  const tamano = siguientePotenciaDos(semillas.length)
  return db.$transaction(async (tx) => {
    const rondas = [] as Array<{ id: string; tamano: number }>
    for (let tam = tamano, orden = 1; tam >= 2; tam /= 2, orden++) rondas.push({ ...(await tx.rondaEliminatoria.create({ data: { faseCompetenciaId: fase.id, orden, nombre: nombreRonda(tam) } })), tamano: tam })
    const primera = rondas[0]!
    const ordenadas = [...semillas].sort((a, b) => a.seed - b.seed)
    const porSeed = new Map(ordenadas.map((seed) => [seed.seed, seed.participacionId]))
    const llaves: Array<{ id: string; orden: number }> = []
    for (let i = 0; i < tamano / 2; i++) {
      const a = i + 1, b = tamano - i
      const local = porSeed.get(a) ?? null, visitante = porSeed.get(b) ?? null
      const llave = await tx.llaveCompetencia.create({ data: { rondaEliminatoriaId: primera.id, orden: i + 1, participacionLocalId: local, participacionVisitanteId: visitante, seedLocal: local ? a : null, seedVisitante: visitante ? b : null, origenLocalTipo: local ? 'SEED' : null, origenVisitanteTipo: visitante ? 'SEED' : null, estado: local && visitante ? 'PROGRAMADA' : local || visitante ? 'BYE' : 'PENDIENTE_PARTICIPANTES', ganadorParticipacionId: local && !visitante ? local : visitante && !local ? visitante : null, metodoResolucion: local && !visitante || visitante && !local ? 'BYE' : null } })
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
  }, { isolationLevel: 'Serializable' })
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
