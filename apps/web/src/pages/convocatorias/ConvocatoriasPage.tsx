import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import type { ConvocatoriaResumen, EquipoResumen, JugadorPlantel } from './tipos'

export default function ConvocatoriasPage() {
  const [convocatorias, setConvocatorias] = useState<ConvocatoriaResumen[]>([])
  const [equipos, setEquipos] = useState<EquipoResumen[]>([])
  const [equipoId, setEquipoId] = useState('')
  const [fecha, setFecha] = useState('')
  const [fechaLimite, setFechaLimite] = useState('')
  const [lugar, setLugar] = useState('')
  const [hora, setHora] = useState('')
  const [notas, setNotas] = useState('')
  const [plantel, setPlantel] = useState<JugadorPlantel[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    Promise.all([apiFetch<ConvocatoriaResumen[]>('/equipos/0/convocatorias'), apiFetch<EquipoResumen[]>('/equipos')])
      .then(([, e]) => {
        if (activo) {
          setConvocatorias([])
          setEquipos(e)
        }
      })
      .catch((err) => { if (activo) setError(err instanceof Error ? err.message : '') })
    return () => { activo = false }
  }, [])

  async function cargarPlantel(id: string) {
    setEquipoId(id)
    setSeleccionados(new Set())
    if (!id) return
    try {
      const plant = await apiFetch<JugadorPlantel[]>(`/equipos/${id}/jugadores`)
      setPlantel(plant.filter((j) => j.estado !== 'BAJA'))
      const list = await apiFetch<ConvocatoriaResumen[]>(`/equipos/${id}/convocatorias`)
      setConvocatorias(list)
    } catch (err) { setError(err instanceof Error ? err.message : '') }
  }

  async function crear(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    const jugadores = [...seleccionados].map((ejId, i) => ({ equipoJugadorId: ejId, orden: i + 1 }))
    try {
      await apiFetch(`/equipos/${equipoId}/convocatorias`, {
        method: 'POST',
        body: JSON.stringify({
          fecha, fechaLimite: fechaLimite || undefined, lugar: lugar || undefined, hora: hora || undefined, notas: notas || undefined, jugadores,
        }),
      })
      setSeleccionados(new Set())
      setMensaje('Convocatoria creada')
      await cargarPlantel(equipoId)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear') }
  }

  return (
    <Layout>
      <h2>Convocatorias</h2>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}

      <div className="tarjeta">
        <h3>Nueva convocatoria</h3>
        <form onSubmit={crear}>
          <div className="campo"><label htmlFor="co-equipo">Equipo</label>
            <select id="co-equipo" value={equipoId} onChange={(e) => void cargarPlantel(e.target.value)} required>
              <option value="">Seleccionar…</option>
              {equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select></div>
          <div className="campo"><label htmlFor="co-fecha">Fecha</label>
            <input id="co-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></div>
          <div className="campo"><label htmlFor="co-limite">Fecha límite (opcional)</label>
            <input id="co-limite" type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} /></div>
          <div className="campo"><label htmlFor="co-lugar">Lugar</label>
            <input id="co-lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} /></div>
          <div className="campo"><label htmlFor="co-hora">Hora</label>
            <input id="co-hora" value={hora} onChange={(e) => setHora(e.target.value)} /></div>
          <div className="campo"><label htmlFor="co-notas">Notas</label>
            <input id="co-notas" value={notas} onChange={(e) => setNotas(e.target.value)} /></div>

          {plantel.length > 0 && (
            <div><p>Jugadores a convocar:</p>
              {plantel.map((j) => (
                <div className="campo" key={j.id}>
                  <label>
                    <input type="checkbox" checked={seleccionados.has(j.id)} onChange={(e) => {
                      const n = new Set(seleccionados)
                      if (e.target.checked) n.add(j.id); else n.delete(j.id)
                      setSeleccionados(n)
                    }} />
                    {' '}{j.nombre} ({j.dorsal ?? '—'}) · {j.estado}
                  </label>
                </div>
              ))}
            </div>
          )}
          <button className="boton boton-primario" type="submit">Crear</button>
        </form>
      </div>

      <div className="grid">
        {convocatorias.map((c) => (
          <div className="tarjeta" key={c.id}>
            <h3>{new Date(c.fecha).toLocaleDateString()} {c.hora ? `· ${c.hora}` : ''}</h3>
            <p>{c.lugar ?? 'Sin lugar'} · {c._count.jugadores} jugadores · {c.publicada ? 'pública' : 'privada'} {c.cancelada ? '· cancelada' : ''}</p>
            <Link className="enlace" to={`/convocatorias/${c.id}`}>Ver</Link>
          </div>
        ))}
        {convocatorias.length === 0 && equipoId && <p>Sin convocatorias.</p>}
        {!equipoId && <p>Seleccioná un equipo para ver sus convocatorias.</p>}
      </div>
    </Layout>
  )
}
