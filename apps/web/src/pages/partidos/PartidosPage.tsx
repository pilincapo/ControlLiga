import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import type { PartidoResumen } from './tipos'

export default function PartidosPage() {
  const [partidos, setPartidos] = useState<PartidoResumen[]>([])
  const [tipo, setTipo] = useState('AMISTOSO')
  const [equipoLocalId, setEquipoLocalId] = useState('')
  const [equipoVisitanteId, setEquipoVisitanteId] = useState('')
  const [fechaHora, setFechaHora] = useState('')
  const [lugar, setLugar] = useState('')
  const [arbitro, setArbitro] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => {
    let a = true
    apiFetch<PartidoResumen[]>('/partidos').then((d) => { if (a) setPartidos(d) }).catch((e) => { if (a) setError(e instanceof Error ? e.message : '') })
    return () => { a = false }
  }, [])

  async function crear(e: FormEvent) {
    e.preventDefault(); setError(null); setMensaje(null)
    try {
      await apiFetch('/partidos', { method: 'POST', body: JSON.stringify({ tipo, equipoLocalId, equipoVisitanteId, fechaHora: new Date(fechaHora).toISOString(), lugar: lugar || undefined, arbitro: arbitro || undefined }) })
      setMensaje('Partido creado')
      const d = await apiFetch<PartidoResumen[]>('/partidos'); setPartidos(d)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear') }
  }

  return (
    <Layout>
      <h2>Partidos</h2>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}

      <div className="tarjeta">
        <h3>Nuevo partido</h3>
        <form onSubmit={crear}>
          <div className="campo"><label htmlFor="p-tipo">Tipo</label>
            <select id="p-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {['AMISTOSO','ENTRENAMIENTO','INTERNO','INFORMAL','OTRO'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <div className="campo"><label htmlFor="p-local">ID equipo local</label>
            <input id="p-local" value={equipoLocalId} onChange={(e) => setEquipoLocalId(e.target.value)} required /></div>
          <div className="campo"><label htmlFor="p-visit">ID equipo visitante</label>
            <input id="p-visit" value={equipoVisitanteId} onChange={(e) => setEquipoVisitanteId(e.target.value)} required /></div>
          <div className="campo"><label htmlFor="p-fecha">Fecha y hora</label>
            <input id="p-fecha" type="datetime-local" value={fechaHora} onChange={(e) => setFechaHora(e.target.value)} required /></div>
          <div className="campo"><label htmlFor="p-lugar">Lugar</label>
            <input id="p-lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} /></div>
          <div className="campo"><label htmlFor="p-arbitro">Árbitro</label>
            <input id="p-arbitro" value={arbitro} onChange={(e) => setArbitro(e.target.value)} /></div>
          <button className="boton boton-primario" type="submit">Crear</button>
        </form>
      </div>

      <div className="grid">
        {partidos.map((p) => (
          <div className="tarjeta" key={p.id}>
            <h3>{p.equipoLocal?.nombre ?? '?'} vs {p.equipoVisitante?.nombre ?? '?'}</h3>
            <p>{p.tipo} · {p.estado} · {new Date(p.fechaHora).toLocaleString()}</p>
            <p>{p.golesLocal != null ? `${p.golesLocal} - ${p.golesVisitante}` : 'VS'} · {p.lugar ?? '—'}</p>
            <Link className="enlace" to={`/partidos/${p.id}`}>Ver</Link>
          </div>
        ))}
        {partidos.length === 0 && <p>Sin partidos.</p>}
      </div>
    </Layout>
  )
}
