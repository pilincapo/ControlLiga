import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import type { FichaJugador } from '../equipos/tipos'

export default function JugadorPage() {
  const { id } = useParams<{ id: string }>()
  const [jugador, setJugador] = useState<FichaJugador | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let activo = true
    apiFetch<FichaJugador>(`/jugadores/${id}`)
      .then((data) => {
        if (activo) setJugador(data)
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudo cargar el jugador')
      })
    return () => {
      activo = false
    }
  }, [id])

  if (!jugador) {
    return (
      <Layout>
        {error && <p className="error">{error}</p>}
        <p>Cargando ficha…</p>
      </Layout>
    )
  }

  const p = jugador.persona

  return (
    <Layout>
      <h2>
        {p.fotoUrl && <img src={p.fotoUrl} alt="" style={{ height: 40, verticalAlign: 'middle', marginRight: 8 }} />}
        {p.nombre} {p.apellido}
      </h2>
      <div className="tarjeta">
        <h3>Datos</h3>
        <p>DNI: {p.dni ?? '—'}</p>
        <p>Nacimiento: {p.fechaNacimiento ? new Date(p.fechaNacimiento).toLocaleDateString() : '—'}</p>
        <p>Posición favorita: {jugador.posicionFavorita ?? '—'}</p>
        <p>Pie dominante: {jugador.pieDominante ?? '—'}</p>
        <p>
          Altura: {jugador.alturaCm ?? '—'} cm · Peso: {jugador.pesoKg ?? '—'} kg
        </p>
        <p>Cuenta vinculada: {jugador.vinculado ? 'sí' : 'no'}</p>
        {p.telefono && <p>Teléfono: {p.telefono}</p>}
        {p.email && <p>Email: {p.email}</p>}
      </div>

      <div className="tarjeta">
        <h3>Historial de equipos</h3>
        <ul className="lista">
          {jugador.historialEquipos.map((e) => (
            <li key={e.id}>
              <Link className="enlace" to={`/equipos/${e.equipoId}`}>
                {e.equipo}
              </Link>{' '}
              · dorsal {e.dorsal ?? '—'} · {e.posiciones ?? '—'} · {e.estado}
              {e.fechaIngreso && ` · ingreso ${new Date(e.fechaIngreso).toLocaleDateString()}`}
              {e.fechaSalida && ` · salida ${new Date(e.fechaSalida).toLocaleDateString()}`}
              {e.motivoBaja && ` · motivo: ${e.motivoBaja}`}
            </li>
          ))}
          {jugador.historialEquipos.length === 0 && <li>Sin equipos.</li>}
        </ul>
      </div>

      <div className="tarjeta">
        <h3>Historial de competiciones</h3>
        <ul className="lista">
          {jugador.historialCompeticiones.map((c) => (
            <li key={c.id}>
              {c.torneo} · {c.temporada} · {c.categoria ?? '—'} · {c.equipo} · dorsal {c.dorsal ?? '—'} ·{' '}
              {c.activo ? 'activo' : 'baja'}
            </li>
          ))}
          {jugador.historialCompeticiones.length === 0 && <li>Sin competiciones.</li>}
        </ul>
      </div>
    </Layout>
  )
}
