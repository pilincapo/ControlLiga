import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import PageState from '../components/PageState'
import StatusBadge from '../components/StatusBadge'
import { apiFetch } from '../utils/api'

type Dato = string | number | boolean | null | Dato[] | { [clave: string]: Dato }

const OMITIR = new Set(['id', 'createdAt', 'updatedAt'])
const rotulo = (clave: string) =>
  clave
    .replace(/([A-Z])/g, ' $1')
    .replaceAll('_', ' ')
    .replace(/^./, (letra) => letra.toUpperCase())

function ValorPublico({ valor }: { valor: Dato }) {
  if (valor === null) return <span>Sin información</span>
  if (typeof valor === 'boolean') return <span>{valor ? 'Sí' : 'No'}</span>
  if (typeof valor === 'number') return <span>{valor}</span>
  if (typeof valor === 'string')
    return valor.includes('_') && valor === valor.toUpperCase() ? (
      <StatusBadge valor={valor} />
    ) : (
      <span>{valor}</span>
    )
  if (Array.isArray(valor))
    return valor.length === 0 ? (
      <span>Sin información disponible.</span>
    ) : (
      <div className="portal-lista">
        {valor.map((item, indice) => (
          <article className="tarjeta" key={indice}>
            <ValorPublico valor={item} />
          </article>
        ))}
      </div>
    )
  return (
    <dl className="datos-publicos">
      {Object.entries(valor)
        .filter(([clave]) => !OMITIR.has(clave))
        .map(([clave, contenido]) => (
          <div key={clave}>
            <dt>{rotulo(clave)}</dt>
            <dd>
              <ValorPublico valor={contenido} />
            </dd>
          </div>
        ))}
    </dl>
  )
}

export default function PublicResourcePage() {
  const location = useLocation()
  const params = useParams<{ id: string }>()
  const [data, setData] = useState<Dato | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ruta = location.pathname.includes('/temporadas/')
    ? `/publico/temporadas/${params.id}/categorias`
    : location.pathname.includes('/competencias/')
      ? `/publico/torneo-categorias/${params.id}/zonas`
      : location.pathname.includes('/partidos/')
        ? `/publico/partidos/${params.id}`
        : `/publico/equipos/${params.id}`

  function cargar() {
    setError(null)
    apiFetch<Dato>(ruta)
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'No se pudo cargar el recurso'),
      )
  }

  useEffect(() => {
    let activo = true
    apiFetch<Dato>(ruta)
      .then((respuesta) => {
        if (activo) setData(respuesta)
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : 'No se pudo cargar el recurso')
      })
    return () => {
      activo = false
    }
  }, [ruta])

  return (
    <main className="portal">
      <div className="portal-detalle">
        <Link className="enlace portal-enlace" to="/publico/torneos">
          Volver al portal
        </Link>
        <p className="portal-kicker">INFORMACIÓN PÚBLICA</p>
        <h2>
          {location.pathname.includes('/partidos/')
            ? 'Partido'
            : location.pathname.includes('/equipos/')
              ? 'Equipo'
              : 'Competencia'}
        </h2>
        {error ? (
          <PageState tipo="error" detalle={error} onReintentar={cargar} />
        ) : data === null ? (
          <PageState tipo="cargando" />
        ) : (
          <ValorPublico valor={data} />
        )}
      </div>
    </main>
  )
}
