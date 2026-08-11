import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../utils/api'

interface Torneo { id: string; nombre: string; descripcion: string | null; logoUrl: string | null; estado: string }
interface Temporada { id: string; nombre: string; estado: string; fechaInicio: string }

export default function PublicPortalPage() {
  const { id } = useParams<{ id: string }>()
  const [torneos, setTorneos] = useState<Torneo[]>([])
  const [torneo, setTorneo] = useState<(Torneo & { temporadas: Temporada[] }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    const ruta = id ? `/publico/torneos/${id}` : '/publico/torneos'
    apiFetch<Torneo[] | (Torneo & { temporadas: Temporada[] })>(ruta)
      .then((data) => {
        if (!activo) return
        if (id) setTorneo(data as Torneo & { temporadas: Temporada[] })
        else setTorneos(data as Torneo[])
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : 'No se pudo cargar el portal')
      })
    return () => {
      activo = false
    }
  }, [id])

  return (
    <main className="portal">
      <header className="portal-encabezado">
        <div>
          <p className="portal-kicker">RESULTADOS Y COMPETENCIAS</p>
          <h1>CONTROL LIGA</h1>
          <p>Seguimiento público de torneos, fixture y resultados publicados.</p>
        </div>
        <nav className="portal-acciones">
          <Link to="/login">Ingresar</Link>
          <Link className="boton boton-primario" to="/register">Crear cuenta</Link>
        </nav>
      </header>
      {error && <p className="error">{error}</p>}
      {!id && (
        <section>
          <div className="portal-seccion-titulo"><span>01</span><h2>Torneos públicos</h2></div>
          <div className="grid portal-grid">
            {torneos.map((t) => (
              <Link className="portal-torneo" key={t.id} to={`/publico/torneos/${t.id}`}>
                <span className="portal-estado">{t.estado}</span>
                <h3>{t.nombre}</h3>
                <p>{t.descripcion ?? 'Información, temporadas y competencia.'}</p>
                <strong>Ver torneo →</strong>
              </Link>
            ))}
          </div>
          {torneos.length === 0 && <div className="tarjeta">No hay torneos publicados.</div>}
        </section>
      )}
      {id && torneo && (
        <section>
          <Link className="enlace" to="/publico/torneos">← Todos los torneos</Link>
          <div className="portal-detalle">
            <span className="portal-estado">{torneo.estado}</span>
            <h2>{torneo.nombre}</h2>
            <p>{torneo.descripcion ?? 'Competencia pública de CONTROL LIGA.'}</p>
          </div>
          <div className="portal-seccion-titulo"><span>02</span><h2>Temporadas</h2></div>
          <div className="grid portal-grid">
            {torneo.temporadas.map((temporada) => (
              <div className="tarjeta" key={temporada.id}>
                <span className="portal-estado">{temporada.estado}</span>
                <h3>{temporada.nombre}</h3>
                <p>Inicio: {new Date(temporada.fechaInicio).toLocaleDateString('es-AR')}</p>
                <Link className="enlace" to={`/publico/torneos/${id}/temporadas/${temporada.id}`}>Ver categorías →</Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
