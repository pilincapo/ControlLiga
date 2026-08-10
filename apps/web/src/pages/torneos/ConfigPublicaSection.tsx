import { useState } from 'react'
import { CLAVES_CONFIGURACION_PUBLICA, CONFIGURACION_PUBLICA_DEFECTO } from '@controlliga/shared'
import type { ConfiguracionPublica } from '@controlliga/shared'
import { apiFetch } from '../../utils/api'

interface Props {
  torneoId: string
  configuracionPublica: ConfiguracionPublica | null
  visiblePublico: boolean
  onRecargar: () => Promise<void>
}

export default function ConfigPublicaSection({ torneoId, configuracionPublica, visiblePublico, onRecargar }: Props) {
  const [config, setConfig] = useState<ConfiguracionPublica>(configuracionPublica ?? CONFIGURACION_PUBLICA_DEFECTO)
  const [publico, setPublico] = useState(visiblePublico)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function guardar() {
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/torneos/${torneoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ configuracionPublica: config, visiblePublico: publico }),
      })
      setMensaje('Configuración pública guardada')
      await onRecargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  const etiquetas: Record<string, string> = {
    mostrarInfo: 'Información del torneo',
    mostrarCategorias: 'Categorías',
    mostrarZonas: 'Zonas',
    mostrarEquipos: 'Equipos',
    mostrarTabla: 'Tabla de posiciones',
    mostrarFixture: 'Fixture',
    mostrarResultados: 'Resultados',
    mostrarEstadisticas: 'Estadísticas',
    mostrarGoleadores: 'Goleadores',
    mostrarTarjetas: 'Tarjetas',
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}
      <div className="tarjeta">
        <h3>Portal público</h3>
        <div className="campo">
          <label>
            <input type="checkbox" checked={publico} onChange={(e) => setPublico(e.target.checked)} /> Torneo visible en el
            portal público
          </label>
        </div>
        <p>
          Marcá qué información se muestra públicamente. Nunca se exponen caja, pagos ni datos privados de los equipos.
        </p>
      </div>
      <div className="tarjeta">
        <h3>Secciones visibles</h3>
        {CLAVES_CONFIGURACION_PUBLICA.map((clave) => (
          <div className="campo" key={clave}>
            <label>
              <input
                type="checkbox"
                checked={config[clave]}
                onChange={(e) => setConfig({ ...config, [clave]: e.target.checked })}
              />{' '}
              {etiquetas[clave] ?? clave}
            </label>
          </div>
        ))}
        <button className="boton boton-primario" onClick={() => void guardar()}>
          Guardar
        </button>
      </div>
    </div>
  )
}
