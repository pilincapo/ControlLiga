import { useState } from 'react'
import type { FormEvent } from 'react'
import { apiFetch } from '../../utils/api'
import { TRANSICIONES_TEMPORADA } from './tipos'
import type { TemporadaResumen } from './tipos'

interface Props {
  torneoId: string
  temporadas: TemporadaResumen[]
  temporadaActiva: string | null
  onSeleccionar: (id: string) => void
  onRecargar: () => Promise<void>
}

export default function TemporadasSection({
  torneoId,
  temporadas,
  temporadaActiva,
  onSeleccionar,
  onRecargar,
}: Props) {
  const [nombre, setNombre] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function crear(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/torneos/${torneoId}/temporadas`, {
        method: 'POST',
        body: JSON.stringify({ nombre, fechaInicio }),
      })
      setNombre('')
      setFechaInicio('')
      setMensaje('Temporada creada')
      await onRecargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la temporada')
    }
  }

  async function cambiarEstado(id: string, estado: string) {
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/temporadas/${id}/estado`, {
        method: 'POST',
        body: JSON.stringify({ estado }),
      })
      await onRecargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
    }
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}
      <div className="tarjeta">
        <h3>Nueva temporada</h3>
        <form onSubmit={crear}>
          <div className="campo">
            <label htmlFor="temp-nombre">Nombre</label>
            <input
              id="temp-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Apertura 2026"
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="temp-inicio">Fecha de inicio</label>
            <input id="temp-inicio" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required />
          </div>
          <button className="boton boton-primario" type="submit">
            Crear
          </button>
        </form>
      </div>
      <div className="tarjeta">
        <h3>Temporadas</h3>
        {temporadas.length === 0 && <p>Sin temporadas todavía.</p>}
        <ul className="lista">
          {temporadas.map((t) => (
            <li key={t.id}>
              <button
                className="boton"
                onClick={() => onSeleccionar(t.id)}
                style={t.id === temporadaActiva ? { borderColor: '#2563eb' } : undefined}
              >
                {t.nombre}
              </button>{' '}
              <span>
                {t.estado} · {t._count.torneoCategorias} categorías · {t._count.participaciones} equipos
              </span>
              {TRANSICIONES_TEMPORADA[t.estado]?.map((siguiente) => (
                <button
                  key={siguiente}
                  className="boton"
                  onClick={() => void cambiarEstado(t.id, siguiente)}
                >
                  → {siguiente}
                </button>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
