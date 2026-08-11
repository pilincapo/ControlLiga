import { useState } from 'react'
import type { FormEvent } from 'react'
import { apiFetch } from '../../utils/api'
import type { Participacion, Zona } from './tipos'

interface Props {
  competicionId: string | null
  zonas: Zona[]
  participaciones: Participacion[]
  onRecargar: () => Promise<void>
}

export default function ZonasSection({ competicionId, zonas, participaciones, onRecargar }: Props) {
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [zonaEditando, setZonaEditando] = useState<Zona | null>(null)
  const [nombreEdicion, setNombreEdicion] = useState('')

  async function crear(e: FormEvent) {
    e.preventDefault()
    if (!competicionId) return
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/torneo-categorias/${competicionId}/zonas`, {
        method: 'POST',
        body: JSON.stringify({ nombre }),
      })
      setNombre('')
      setMensaje('Zona creada')
      await onRecargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la zona')
    }
  }

  async function renombrar(e: FormEvent) {
    e.preventDefault()
    if (!zonaEditando) return
    try {
      await apiFetch(`/zonas/${zonaEditando.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nombre: nombreEdicion }),
      })
      await onRecargar()
      setZonaEditando(null)
      setMensaje('Zona actualizada')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo renombrar la zona')
    }
  }

  async function asignarZona(participacionId: string, zonaId: string | null) {
    setError(null)
    try {
      await apiFetch(`/participaciones/${participacionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ zonaId: zonaId ?? null }),
      })
      await onRecargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo asignar la zona')
    }
  }

  if (!competicionId) {
    return <p>Seleccioná una competición en la pestaña Categorías para gestionar sus zonas.</p>
  }

  const participantesDeZona = participaciones.filter(
    (p) =>
      p.torneoCategoriaId === competicionId &&
      (p.estado === 'CONFIRMADO' || p.estado === 'INSCRIPTO'),
  )

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}
      <div className="tarjeta">
        <h3>Nueva zona</h3>
        <form onSubmit={crear}>
          <div className="campo">
            <label htmlFor="zona-nombre">Nombre</label>
            <input
              id="zona-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Zona A"
              required
            />
          </div>
          <button className="boton boton-primario" type="submit">
            Crear
          </button>
        </form>
      </div>
      <div className="tarjeta">
        <h3>Zonas</h3>
        {zonaEditando && (
          <form className="acciones" onSubmit={renombrar}>
            <label htmlFor="zona-edicion">Nuevo nombre</label>
            <input
              id="zona-edicion"
              value={nombreEdicion}
              onChange={(e) => setNombreEdicion(e.target.value)}
              required
            />
            <button className="boton boton-primario" type="submit">
              Guardar
            </button>
            <button className="boton" type="button" onClick={() => setZonaEditando(null)}>
              Cancelar
            </button>
          </form>
        )}
        {zonas.length === 0 && <p>Sin zonas. Podés usar una zona única o crear varias.</p>}
        <ul className="lista">
          {zonas.map((z) => (
            <li key={z.id}>
              {z.nombre} ({z._count?.participaciones ?? 0} equipos){' '}
              <button
                className="boton"
                onClick={() => {
                  setZonaEditando(z)
                  setNombreEdicion(z.nombre)
                }}
              >
                Renombrar
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="tarjeta">
        <h3>Asignar equipos a zonas</h3>
        <ul className="lista">
          {participantesDeZona.map((p) => (
            <li key={p.id}>
              {p.equipo.nombre} · zona actual: {p.zona?.nombre ?? '—'} ·{' '}
              <select
                value={p.zonaId ?? ''}
                onChange={(e) => void asignarZona(p.id, e.target.value || null)}
              >
                <option value="">Sin zona</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nombre}
                  </option>
                ))}
              </select>
            </li>
          ))}
          {participantesDeZona.length === 0 && <li>Sin equipos asignados a esta competición.</li>}
        </ul>
      </div>
    </div>
  )
}
