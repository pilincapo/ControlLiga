import type { PrismaClient } from '../generated/prisma/client.js'
import { auditar } from '../auth/auditoria.js'
import { conflicto, badRequest } from '../http.js'
import { validarDesempates, validarSistemaPuntos } from '@controlliga/shared'
import type { CriterioDesempate, SistemaPuntos } from '@controlliga/shared'

type Db = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
type Equipo = { id: string; nombre: string; escudoUrl: string | null }
type PartidoFixture = { id: string; equipoLocalId: string | null; equipoVisitanteId: string | null; estado: string; golesLocal: number | null; golesVisitante: number | null; publicada: boolean; fechaHora: Date; jornadaId: string | null; equipoLocal: Equipo | null; equipoVisitante: Equipo | null; formacionInstancias: { id: string }[]; convocatorias: { id: string; cancelada: boolean }[] }

export const formatosFixture = ['TODOS_CONTRA_TODOS', 'UNA_RUEDA', 'DOS_RUEDAS'] as const

export function leerReglas(config: { sistemaPuntos: unknown; desempates: unknown }): { sistemaPuntos: SistemaPuntos; desempates: CriterioDesempate[] } {
  if (!validarSistemaPuntos(config.sistemaPuntos) || !validarDesempates(config.desempates)) throw badRequest('La configuración de puntos/desempates es inválida')
  return { sistemaPuntos: config.sistemaPuntos, desempates: config.desempates }
}

export function calcularRondas(ids: string[], ruedas: number): Array<Array<[string, string] | [string, null]>> {
  const valores: Array<string | null> = [...ids].sort()
  if (ids.length % 2) valores.push(null)
  const rondas: Array<Array<[string, string] | [string, null]>> = []
  const total = valores.length
  for (let ronda = 0; ronda < total - 1; ronda++) {
    const pares: Array<[string, string] | [string, null]> = []
    for (let i = 0; i < total / 2; i++) {
      const a = valores[i]
      const b = valores[total - 1 - i]
      if (a !== undefined && b !== undefined && a !== null && b !== null) pares.push([a, b])
      else if ((a !== undefined && a !== null) || (b !== undefined && b !== null)) pares.push([(a ?? b) as string, null])
    }
    rondas.push(pares)
    const fijo = valores[0]
    const rotados = [fijo ?? null, valores[total - 1] ?? null, ...valores.slice(1, total - 1)]
    valores.splice(0, valores.length, ...rotados)
  }
  return ruedas === 2 ? [...rondas, ...rondas.map((r) => r.map(([a, b]) => (b === null ? [a, b] : [b, a]) as [string, string] | [string, null]))] : rondas
}

export async function cargarCompetencia(db: Db, torneoCategoriaId: string, zonaId?: string | null) {
  const tc = await db.torneoCategoria.findUnique({ where: { id: torneoCategoriaId }, include: { configuracion: true, temporada: { select: { id: true, torneoId: true, estado: true } }, torneo: { select: { id: true, visiblePublico: true, configuracionPublica: true } } } })
  if (!tc) return null
  if (zonaId) {
    const zona = await db.zona.findUnique({ where: { id: zonaId }, select: { id: true, torneoCategoriaId: true } })
    if (!zona || zona.torneoCategoriaId !== torneoCategoriaId) return null
  }
  return { ...tc, zonaId: zonaId ?? null }
}

export async function equiposConfirmados(db: Db, torneoCategoriaId: string, zonaId: string | null) {
  return db.equipoParticipacion.findMany({ where: { torneoCategoriaId, zonaId, estado: 'CONFIRMADO' }, select: { equipoId: true, equipo: { select: { id: true, nombre: true, escudoUrl: true } } }, orderBy: { equipoId: 'asc' } })
}

export function validarCantidad(equipos: unknown[]) {
  if (equipos.length < 2) throw badRequest('Se necesitan al menos dos equipos confirmados')
}

export async function generarFixture(db: Db, opts: { torneoCategoriaId: string; zonaId: string | null; ruedas: number; usuarioId: string; regenerar: boolean }) {
  const competencia = await cargarCompetencia(db, opts.torneoCategoriaId, opts.zonaId)
  if (!competencia) throw badRequest('La competencia o zona no existe')
  if (!formatosFixture.includes(competencia.configuracion?.formato as (typeof formatosFixture)[number])) throw badRequest('Formato fuera de alcance FASE 8')
  const ruedas = opts.ruedas
  const participaciones = await equiposConfirmados(db, opts.torneoCategoriaId, opts.zonaId)
  validarCantidad(participaciones)
  const partidosExistentes = await db.partido.findMany({ where: { torneoCategoriaId: opts.torneoCategoriaId, zonaId: opts.zonaId, jornada: { isNot: null } }, select: { id: true, estado: true, golesLocal: true, golesVisitante: true, jornadaId: true, formacionInstancias: { select: { id: true } }, convocatorias: { select: { id: true, cancelada: true } } } }) as unknown as PartidoFixture[]
  const jornadasExistentes = await db.jornada.findMany({ where: { torneoCategoriaId: opts.torneoCategoriaId, zonaId: opts.zonaId }, select: { id: true, numero: true } })
  if (jornadasExistentes.length && !opts.regenerar) throw conflicto('fixture_existente', 'Ya existe un fixture para esta competencia y zona')
  if (opts.regenerar) {
    const bloqueado = partidosExistentes.find((p) => p.estado !== 'PROGRAMADO' || p.golesLocal !== null || p.golesVisitante !== null || p.formacionInstancias.length > 0 || p.convocatorias.length > 0)
    if (bloqueado) throw conflicto('fixture_bloqueado', 'El fixture contiene partidos operativos o dependencias históricas')
  }
  const rondas = calcularRondas(participaciones.map((p) => p.equipoId), ruedas)
  const nombres = new Map(participaciones.map((p) => [p.equipoId, p.equipo]))
  const locales = new Map<string, number>(), visitantes = new Map<string, number>()
  for (const id of nombres.keys()) { locales.set(id, 0); visitantes.set(id, 0) }
  const resultado = await db.$transaction(async (tx) => {
    if (opts.regenerar) {
      await auditar(tx, { entidad: 'Fixture', entidadId: opts.torneoCategoriaId, accion: 'DELETE', usuarioId: opts.usuarioId, cambios: { operacion: 'regenerar', jornadas: jornadasExistentes.map((j) => j.id), partidos: partidosExistentes.map((p) => p.id) } })
      await tx.partido.deleteMany({ where: { id: { in: partidosExistentes.map((p) => p.id) } } })
      await tx.jornadaEquipoDescanso.deleteMany({ where: { jornadaId: { in: jornadasExistentes.map((j) => j.id) } } })
      await tx.jornada.deleteMany({ where: { id: { in: jornadasExistentes.map((j) => j.id) } } })
    }
    const jornadas = [] as unknown[]
    for (let i = 0; i < rondas.length; i++) {
      const numero = i + 1
      const existente = await tx.jornada.findFirst({ where: { torneoCategoriaId: opts.torneoCategoriaId, zonaId: opts.zonaId, numero }, select: { id: true } })
      if (existente) throw conflicto('jornada_duplicada', `La jornada ${numero} ya existe`)
      const jornada = await tx.jornada.create({ data: { torneoCategoriaId: opts.torneoCategoriaId, zonaId: opts.zonaId, numero, nombre: `Jornada ${numero}` } })
      jornadas.push(jornada)
      for (const [a, b] of rondas[i] ?? []) {
        if (b === null) { await tx.jornadaEquipoDescanso.create({ data: { jornadaId: jornada.id, equipoId: a, motivo: 'DESCANSO_AUTOMATICO' } }); continue }
        const al = (locales.get(a) ?? 0) - (visitantes.get(a) ?? 0)
        const bl = (locales.get(b) ?? 0) - (visitantes.get(b) ?? 0)
        const local = al < bl || (al === bl && (i + a).length % 2 === 0) ? a : b
        const visitante = local === a ? b : a
        locales.set(local, (locales.get(local) ?? 0) + 1); visitantes.set(visitante, (visitantes.get(visitante) ?? 0) + 1)
        await tx.partido.create({ data: { tipo: 'OFICIAL', torneoId: competencia.torneoId, temporadaId: competencia.temporadaId, torneoCategoriaId: opts.torneoCategoriaId, zonaId: opts.zonaId, jornadaId: jornada.id, equipoLocalId: local, equipoVisitanteId: visitante, equipoResponsableId: local, fechaHora: new Date() } })
      }
    }
    await auditar(tx, { entidad: 'Fixture', entidadId: opts.torneoCategoriaId, accion: 'CREATE', usuarioId: opts.usuarioId, cambios: { zonaId: opts.zonaId, ruedas, jornadas: rondas.length, equipos: [...nombres.keys()] } })
    return jornadas
  }, { isolationLevel: 'Serializable' })
  return { jornadas: resultado, cantidadPartidos: rondas.reduce((n, r) => n + r.filter((p) => p[1] !== null).length, 0), equipos: [...nombres.values()] }
}

type Fila = { equipo: Equipo; PJ: number; PG: number; PE: number; PP: number; GF: number; GC: number; DG: number; PTS: number; posicion?: number }

export function calcularTabla(equipos: Equipo[], partidos: Array<{ equipoLocalId: string | null; equipoVisitanteId: string | null; golesLocal: number | null; golesVisitante: number | null }>, reglas: { sistemaPuntos: SistemaPuntos; desempates: CriterioDesempate[] }) {
  const filas = new Map(equipos.map((equipo) => [equipo.id, { equipo, PJ: 0, PG: 0, PE: 0, PP: 0, GF: 0, GC: 0, DG: 0, PTS: 0 } as Fila]))
  for (const p of partidos) {
    const l = p.equipoLocalId ? filas.get(p.equipoLocalId) : undefined, v = p.equipoVisitanteId ? filas.get(p.equipoVisitanteId) : undefined
    if (!l || !v || p.golesLocal === null || p.golesVisitante === null) continue
    l.PJ++; v.PJ++; l.GF += p.golesLocal; l.GC += p.golesVisitante; v.GF += p.golesVisitante; v.GC += p.golesLocal
    if (p.golesLocal > p.golesVisitante) { l.PG++; v.PP++; l.PTS += reglas.sistemaPuntos.victoria; v.PTS += reglas.sistemaPuntos.derrota } else if (p.golesLocal < p.golesVisitante) { v.PG++; l.PP++; v.PTS += reglas.sistemaPuntos.victoria; l.PTS += reglas.sistemaPuntos.derrota } else { l.PE++; v.PE++; l.PTS += reglas.sistemaPuntos.empate; v.PTS += reglas.sistemaPuntos.empate }
  }
  for (const f of filas.values()) f.DG = f.GF - f.GC
  const criterio = (f: Fila, c: CriterioDesempate) => c === 'PUNTOS' ? f.PTS : c === 'DIFERENCIA_GOLES' ? f.DG : c === 'GOLES_FAVOR' ? f.GF : 0
  const ordenar = (grupo: Fila[], indice: number): Fila[] => {
    if (grupo.length < 2 || indice >= reglas.desempates.length) return grupo
    const c = reglas.desempates[indice]!
    if (c === 'MENOS_TARJETAS' || c === 'PARTIDO_DESEMPATE') return ordenar(grupo, indice + 1)
    const valores = new Map<string, [number, number, number]>()
    if (c === 'RESULTADO_ENFRENTAMIENTO') {
      for (const f of grupo) valores.set(f.equipo.id, [0, 0, 0])
      for (const p of partidos) if (p.equipoLocalId && p.equipoVisitanteId && valores.has(p.equipoLocalId) && valores.has(p.equipoVisitanteId) && p.golesLocal !== null && p.golesVisitante !== null) {
        const l = valores.get(p.equipoLocalId)!, v = valores.get(p.equipoVisitanteId)!
        const puntosLocal = p.golesLocal > p.golesVisitante ? reglas.sistemaPuntos.victoria : p.golesLocal === p.golesVisitante ? reglas.sistemaPuntos.empate : reglas.sistemaPuntos.derrota
        const puntosVisitante = p.golesVisitante > p.golesLocal ? reglas.sistemaPuntos.victoria : p.golesLocal === p.golesVisitante ? reglas.sistemaPuntos.empate : reglas.sistemaPuntos.derrota
        l[0] += puntosLocal; v[0] += puntosVisitante; l[1] += p.golesLocal - p.golesVisitante; v[1] += p.golesVisitante - p.golesLocal; l[2] += p.golesLocal; v[2] += p.golesVisitante
      }
    }
    const obtener = (f: Fila): [number, number, number] => c === 'RESULTADO_ENFRENTAMIENTO' ? valores.get(f.equipo.id) ?? [0, 0, 0] : [criterio(f, c), 0, 0]
    const grupos = new Map<string, Fila[]>(); for (const f of grupo) { const key = obtener(f).join(':'); grupos.set(key, [...(grupos.get(key) ?? []), f]) }
    return [...grupos.entries()].sort((a, b) => { const [av0 = 0, av1 = 0, av2 = 0] = a[0].split(':').map(Number), [bv0 = 0, bv1 = 0, bv2 = 0] = b[0].split(':').map(Number); return (bv0 - av0) || (bv1 - av1) || (bv2 - av2) }).flatMap(([, g]) => ordenar(g, indice + 1))
  }
  const base = [...filas.values()].sort((a, b) => b.PTS - a.PTS)
  const ordenada: Fila[] = []; for (let i = 0; i < base.length;) { const grupo = base.slice(i).filter((f) => f.PTS === base[i]!.PTS); ordenada.push(...ordenar(grupo, 0)); i += grupo.length }
  return { filas: ordenada.map((f, i) => ({ ...f, posicion: i + 1 })), desempateResuelto: !ordenada.some((f, i) => { const previo = i > 0 ? ordenada[i - 1] : undefined; return previo !== undefined && f.PTS === previo.PTS && f.DG === previo.DG && f.GF === previo.GF }), criteriosNoDisponibles: reglas.desempates.filter((c) => c === 'MENOS_TARJETAS'), reglas }
}
