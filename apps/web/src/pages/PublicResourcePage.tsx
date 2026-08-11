import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { apiFetch } from '../utils/api'

export default function PublicResourcePage() {
  const location = useLocation()
  const params = useParams<{ id: string }>()
  const [data, setData] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const ruta = location.pathname.includes('/temporadas/')
      ? `/publico/temporadas/${params.id}/categorias`
      : location.pathname.includes('/competencias/')
        ? `/publico/torneo-categorias/${params.id}/zonas`
        : location.pathname.includes('/partidos/')
          ? `/publico/partidos/${params.id}`
          : `/publico/equipos/${params.id}`
    apiFetch<unknown>(ruta).then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar el recurso'))
  }, [location.pathname, params.id])
  return (
    <main className="portal">
      <div className="portal-detalle">
        <Link className="enlace" to="/publico/torneos">← Portal público</Link>
        <h1>Información pública</h1>
        {error ? <p className="error">{error}</p> : <pre className="portal-datos">{data ? JSON.stringify(data, null, 2) : 'Cargando...'}</pre>}
      </div>
    </main>
  )
}
