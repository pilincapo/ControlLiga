import { useEffect, useState } from 'react'
import { apiFetch } from '../../utils/api'

type Props = { competenciaId: string | null; zonaId?: string }
type Fixture = { jornadas: Array<{ id: string; numero: number; descansos: Array<{ equipo: { nombre: string } }>; partidos: Array<{ equipoLocal: { nombre: string } | null; equipoVisitante: { nombre: string } | null; estado: string; golesLocal: number | null; golesVisitante: number | null }> }> }
type Tabla = { filas: Array<{ posicion: number; equipo: { nombre: string }; PJ: number; PG: number; PE: number; PP: number; GF: number; GC: number; DG: number; PTS: number }>; criteriosNoDisponibles: string[] }

export default function FixtureTablaSection({ competenciaId, zonaId }: Props) {
  const [fixture, setFixture] = useState<Fixture | null>(null)
  const [tabla, setTabla] = useState<Tabla | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!competenciaId) return
    const query = zonaId ? `?zonaId=${zonaId}` : ''
    Promise.all([apiFetch<Fixture>(`/torneo-categorias/${competenciaId}/fixture${query}`), apiFetch<Tabla>(`/torneo-categorias/${competenciaId}/tabla${query}`)])
      .then(([f, t]) => { setFixture(f); setTabla(t) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar fixture y tabla'))
  }, [competenciaId, zonaId])
  if (!competenciaId) return <div className="tarjeta"><p>Seleccioná una competencia.</p></div>
  return <div className="tarjeta"><h3>Fixture y tabla</h3>{error && <p className="error">{error}</p>}{fixture?.jornadas.map((j) => <section key={j.id}><h4>Jornada {j.numero}</h4>{j.descansos.length > 0 && <p>Descansa: {j.descansos.map((d) => d.equipo.nombre).join(', ')}</p>}<ul>{j.partidos.map((p, i) => <li key={i}>{p.equipoLocal?.nombre} {p.golesLocal ?? '-'} - {p.golesVisitante ?? '-'} {p.equipoVisitante?.nombre} ({p.estado})</li>)}</ul></section>)}{tabla && <><h4>Posiciones</h4><table><thead><tr>{['#', 'Equipo', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'PTS'].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{tabla.filas.map((f) => <tr key={f.equipo.nombre}><td>{f.posicion}</td><td>{f.equipo.nombre}</td><td>{f.PJ}</td><td>{f.PG}</td><td>{f.PE}</td><td>{f.PP}</td><td>{f.GF}</td><td>{f.GC}</td><td>{f.DG}</td><td>{f.PTS}</td></tr>)}</tbody></table>{tabla.criteriosNoDisponibles.length > 0 && <small>No disponible: {tabla.criteriosNoDisponibles.join(', ')}</small>}</>}</div>
}
