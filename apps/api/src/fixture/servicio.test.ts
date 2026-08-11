import { describe, expect, it } from 'vitest'
import { calcularRondas, calcularTabla } from './servicio.js'

const equipos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, nombre: `Equipo ${i}`, escudoUrl: null }))
const reglas = { sistemaPuntos: { victoria: 3, empate: 1, derrota: 0 }, desempates: ['PUNTOS', 'DIFERENCIA_GOLES', 'GOLES_FAVOR'] as const }

describe('fixture round-robin', () => {
  it.each([[4, 3, 6], [5, 5, 10], [6, 5, 15], [7, 7, 21]])('genera cantidades exactas para %i equipos', (n, jornadas, partidos) => {
    const rondas = calcularRondas(equipos(n).map((e) => e.id), 1)
    expect(rondas).toHaveLength(jornadas)
    const partidosGenerados = rondas.flat().filter(([, b]) => b !== null)
    expect(partidosGenerados).toHaveLength(partidos)
    const parejas = partidosGenerados.map(([a, b]) => [a, b].sort().join(':'))
    expect(new Set(parejas).size).toBe(partidos)
    if (n % 2) expect(rondas.every((r) => r.filter(([, b]) => b === null).length === 1)).toBe(true)
  })
  it('duplica ruedas e invierte cada pareja', () => {
    const una = calcularRondas(equipos(4).map((e) => e.id), 1)
    const dos = calcularRondas(equipos(4).map((e) => e.id), 2)
    expect(dos).toHaveLength(6)
    expect(dos.slice(3).flat()).toEqual(una.flat().map(([a, b]) => [b, a]))
  })
})

describe('tabla calculada', () => {
  it('aplica puntos personalizados y deja equipos sin partidos', () => {
    const resultado = calcularTabla(equipos(3), [{ equipoLocalId: 'e0', equipoVisitanteId: 'e1', golesLocal: 2, golesVisitante: 0 }], { sistemaPuntos: { victoria: 2, empate: 5, derrota: 0 }, desempates: ['PUNTOS'] })
    expect(resultado.filas.find((f) => f.equipo.id === 'e0')?.PTS).toBe(2)
    expect(resultado.filas.find((f) => f.equipo.id === 'e2')?.PJ).toBe(0)
  })
  it('usa resultado entre sí y marca MENOS_TARJETAS no disponible', () => {
    const resultado = calcularTabla(equipos(3), [
      { equipoLocalId: 'e0', equipoVisitanteId: 'e1', golesLocal: 1, golesVisitante: 0 },
      { equipoLocalId: 'e1', equipoVisitanteId: 'e2', golesLocal: 1, golesVisitante: 0 },
      { equipoLocalId: 'e2', equipoVisitanteId: 'e0', golesLocal: 1, golesVisitante: 0 },
    ], { ...reglas, desempates: ['PUNTOS', 'RESULTADO_ENFRENTAMIENTO', 'MENOS_TARJETAS'] })
    expect(resultado.criteriosNoDisponibles).toEqual(['MENOS_TARJETAS'])
    expect(resultado.desempateResuelto).toBe(false)
  })
})
