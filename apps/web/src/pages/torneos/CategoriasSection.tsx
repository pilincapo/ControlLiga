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
  const [configurando, setConfigurando] = useState<TorneoCategoriaDetalle | null>(null)
  const [victoria, setVictoria] = useState('3')
  const [empate, setEmpate] = useState('1')
  const [derrota, setDerrota] = useState('0')
  const [desempatesTexto, setDesempatesTexto] = useState('PUNTOS, DIFERENCIA_GOLES, GOLES_FAVOR')
  const [formato, setFormato] = useState('TODOS_CONTRA_TODOS')

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

  function editarConfiguracion(tc: TorneoCategoriaDetalle) {
    const sistemaPuntos = tc.configuracion?.sistemaPuntos ?? SISTEMA_PUNTOS_DEFECTO
    setVictoria(String(sistemaPuntos.victoria))
    setEmpate(String(sistemaPuntos.empate))
    setDerrota(String(sistemaPuntos.derrota))
    setDesempatesTexto(
      (tc.configuracion?.desempates ?? ['PUNTOS', 'DIFERENCIA_GOLES', 'GOLES_FAVOR']).join(', '),
    )
    setFormato(tc.configuracion?.formato ?? 'TODOS_CONTRA_TODOS')
    setConfigurando(tc)
  }

  async function guardarConfiguracion(e: FormEvent) {
    e.preventDefault()
    if (!configurando) return
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/torneo-categorias/${configurando.id}/configuracion`, {
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
          formato: formato,
        }),
      })
      setMensaje('Configuración guardada')
      setConfigurando(null)
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
            <select
              id="cat-select"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              required
            >
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
        {configurando && (
          <form className="tarjeta" onSubmit={guardarConfiguracion}>
            <h4>Configuración: {configurando.categoria.nombre}</h4>
            <div className="grid">
              <div className="campo">
                <label htmlFor="puntos-victoria">Victoria</label>
                <input
                  id="puntos-victoria"
                  type="number"
                  min="0"
                  value={victoria}
                  onChange={(e) => setVictoria(e.target.value)}
                  required
                />
              </div>
              <div className="campo">
                <label htmlFor="puntos-empate">Empate</label>
                <input
                  id="puntos-empate"
                  type="number"
                  min="0"
                  value={empate}
                  onChange={(e) => setEmpate(e.target.value)}
                  required
                />
              </div>
              <div className="campo">
                <label htmlFor="puntos-derrota">Derrota</label>
                <input
                  id="puntos-derrota"
                  type="number"
                  min="0"
                  value={derrota}
                  onChange={(e) => setDerrota(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="campo">
              <label htmlFor="desempates">Desempates, separados por coma</label>
              <input
                id="desempates"
                value={desempatesTexto}
                onChange={(e) => setDesempatesTexto(e.target.value)}
                required
              />
            </div>
            <div className="campo">
              <label htmlFor="formato">Formato</label>
              <select id="formato" value={formato} onChange={(e) => setFormato(e.target.value)}>
                <option value="TODOS_CONTRA_TODOS">Todos contra todos</option>
                <option value="ELIMINACION_DIRECTA">Eliminación directa</option>
              </select>
            </div>
            <div className="acciones">
              <button className="boton boton-primario" type="submit">
                Guardar configuración
              </button>
              <button className="boton" type="button" onClick={() => setConfigurando(null)}>
                Cancelar
              </button>
            </div>
          </form>
        )}
        {torneoCategorias.length === 0 && <p>Sin competiciones todavía.</p>}
        {torneoCategorias.map((tc) => {
          const puntos = tc.configuracion?.sistemaPuntos ?? SISTEMA_PUNTOS_DEFECTO
          const desempates = tc.configuracion?.desempates ?? [
            'PUNTOS',
            'DIFERENCIA_GOLES',
            'GOLES_FAVOR',
          ]
          return (
            <div
              key={tc.id}
              className="tarjeta"
              style={tc.id === competicionActiva ? { borderColor: '#2563eb' } : undefined}
            >
              <h4>{tc.categoria.nombre}</h4>
              <p>
                Estado: <strong>{tc.estado}</strong>
              </p>
              <p>
                Puntos: {puntos.victoria}/{puntos.empate}/{puntos.derrota} · Desempates:{' '}
                {desempates.join(', ')} · Formato:{' '}
                {tc.configuracion?.formato ?? 'TODOS_CONTRA_TODOS'}
              </p>
              <button className="boton" onClick={() => onSeleccionarCompeticion(tc.id)}>
                Gestionar zonas
              </button>{' '}
              <button className="boton" onClick={() => editarConfiguracion(tc)}>
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
