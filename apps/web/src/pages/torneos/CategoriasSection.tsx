import { useState } from 'react'
import type { FormEvent } from 'react'
import { SISTEMA_PUNTOS_DEFECTO } from '@controlliga/shared'
import { apiFetch } from '../../utils/api'
import type { CategoriaGlobal, TorneoCategoriaDetalle } from './tipos'

interface Props {
  torneoId: string
  temporadaId: string
  torneoCategorias: TorneoCategoriaDetalle[]
  categorias: CategoriaGlobal[]
  competicionActiva: string | null
  onSeleccionarCompeticion: (id: string) => void
  onRecargar: () => Promise<void>
}

export default function CategoriasSection({
  torneoId,
  temporadaId,
  torneoCategorias,
  categorias,
  competicionActiva,
  onSeleccionarCompeticion,
  onRecargar,
}: Props) {
  const [categoriaId, setCategoriaId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function asociar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/torneos/${torneoId}/temporadas/${temporadaId}/categorias`, {
        method: 'POST',
        body: JSON.stringify({ categoriaId }),
      })
      setCategoriaId('')
      setMensaje('Categoría asociada')
      await onRecargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo asociar la categoría')
    }
  }

  async function guardarConfiguracion(tc: TorneoCategoriaDetalle) {
    const sistemaPuntos = tc.configuracion?.sistemaPuntos ?? SISTEMA_PUNTOS_DEFECTO
    const desempates = tc.configuracion?.desempates ?? ['PUNTOS', 'DIFERENCIA_GOLES', 'GOLES_FAVOR']
    const formato = tc.configuracion?.formato ?? 'TODOS_CONTRA_TODOS'
    const victoria = window.prompt('Puntos por victoria', String(sistemaPuntos.victoria))
    const empate = window.prompt('Puntos por empate', String(sistemaPuntos.empate))
    const derrota = window.prompt('Puntos por derrota', String(sistemaPuntos.derrota))
    const desempatesTexto = window.prompt('Desempates (ordenados, separados por coma)', desempates.join(', '))
    const formatoNuevo = window.prompt('Formato', formato)
    if (victoria === null || empate === null || derrota === null || desempatesTexto === null || formatoNuevo === null) {
      return
    }
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/torneo-categorias/${tc.id}/configuracion`, {
        method: 'PATCH',
        body: JSON.stringify({
          sistemaPuntos: {
            victoria: Number(victoria),
            empate: Number(empate),
            derrota: Number(derrota),
          },
          desempates: desempatesTexto
            .split(',')
            .map((d) => d.trim())
            .filter((d) => d.length > 0),
          formato: formatoNuevo.trim(),
        }),
      })
      setMensaje('Configuración guardada')
      await onRecargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la configuración')
    }
  }

  async function cambiarEstado(tc: TorneoCategoriaDetalle) {
    const nuevo = tc.estado === 'ACTIVA' ? 'CERRADA' : 'ACTIVA'
    try {
      await apiFetch(`/torneo-categorias/${tc.id}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: nuevo }),
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
        <h3>Asociar categoría</h3>
        <form onSubmit={asociar}>
          <div className="campo">
            <label htmlFor="cat-select">Categoría</label>
            <select id="cat-select" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
              <option value="">Seleccionar…</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <button className="boton boton-primario" type="submit">
            Asociar
          </button>
        </form>
      </div>
      <div className="tarjeta">
        <h3>Competiciones</h3>
        {torneoCategorias.length === 0 && <p>Sin competiciones todavía.</p>}
        {torneoCategorias.map((tc) => {
          const puntos = tc.configuracion?.sistemaPuntos ?? SISTEMA_PUNTOS_DEFECTO
          const desempates = tc.configuracion?.desempates ?? ['PUNTOS', 'DIFERENCIA_GOLES', 'GOLES_FAVOR']
          return (
            <div key={tc.id} className="tarjeta" style={tc.id === competicionActiva ? { borderColor: '#2563eb' } : undefined}>
              <h4>{tc.categoria.nombre}</h4>
              <p>
                Estado: <strong>{tc.estado}</strong>
              </p>
              <p>
                Puntos: {puntos.victoria}/{puntos.empate}/{puntos.derrota} · Desempates: {desempates.join(', ')} ·
                Formato: {tc.configuracion?.formato ?? 'TODOS_CONTRA_TODOS'}
              </p>
              <button className="boton" onClick={() => onSeleccionarCompeticion(tc.id)}>
                Gestionar zonas
              </button>{' '}
              <button className="boton" onClick={() => void guardarConfiguracion(tc)}>
                Editar configuración
              </button>{' '}
              <button className="boton" onClick={() => void cambiarEstado(tc)}>
                {tc.estado === 'ACTIVA' ? 'Cerrar' : 'Activar'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
