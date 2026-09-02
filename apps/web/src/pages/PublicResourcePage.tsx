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

type FasePublica = {
  id: string
  orden: number
  nombre: string
  tipo: string
  estado: string
  participantesFase: Array<{ id: string; seed: number | null; participacion: { equipo: { nombre: string } }; clasificadoOrigen: { reglaClasificacion: { faseOrigenId: string } } | null }>
  reglasClasificacionOrigen: Array<{ id: string; tipo: string; estado: string; clasificados: Array<{ id: string; seed: number; etiquetaOrigen: string; participacion: { equipo: { nombre: string } } }> }>
  grupos: Array<{ id: string; nombre: string; participaciones: Array<{ id: string; equipo: { nombre: string } }> }>
  rondas: Array<{ id: string; nombre: string; formatoSerie?: string; llaves: Array<{ id: string; estado: string; participacionLocal: { equipo: { nombre: string } } | null; participacionVisitante: { equipo: { nombre: string } } | null; ganadorParticipacion: { equipo: { nombre: string } } | null; definicion?: { tipo: string; penalesLocal: number | null; penalesVisitante: number | null } | null; partidos?: Array<{ id: string; ordenSerie: number | null; golesLocal: number | null; golesVisitante: number | null }> }> }>
}

function FasesPublicas({ fases }: { fases: FasePublica[] }) {
  if (fases.length === 0) return <PageState tipo="vacio" detalle="No hay fases publicadas." />
  return <div className="portal-lista">{fases.map((fase) => <article className="tarjeta" key={fase.id}>
    <h3>{fase.orden}. {fase.nombre} <StatusBadge valor={fase.tipo} /> <StatusBadge valor={fase.estado} /></h3>
    {fase.grupos.map((grupo) => <p key={grupo.id}><strong>Grupo {grupo.nombre}:</strong> {grupo.participaciones.map((p) => p.equipo.nombre).join(', ') || 'Sin participantes visibles'}</p>)}
    {fase.participantesFase.length > 0 && <section><h4>Participantes clasificados</h4><ul className="lista">{fase.participantesFase.map((participante) => <li key={participante.id}>{participante.participacion.equipo.nombre}{participante.seed !== null && ` · Seed ${participante.seed}`}{participante.clasificadoOrigen && ' · Clasificado desde fase previa'}</li>)}</ul></section>}
    {fase.reglasClasificacionOrigen.length > 0 && <section><h4>Clasificación</h4><ul className="lista">{fase.reglasClasificacionOrigen.map((regla) => <li key={regla.id}>{regla.tipo.replaceAll('_', ' ').toLowerCase()} <StatusBadge valor={regla.estado} />{regla.clasificados.length > 0 && <ul>{regla.clasificados.map((clasificado) => <li key={clasificado.id}>{clasificado.participacion.equipo.nombre} · {clasificado.etiquetaOrigen} · Seed {clasificado.seed}</li>)}</ul>}</li>)}</ul></section>}
    {fase.rondas.map((ronda) => <section key={ronda.id}><h4>{ronda.nombre} {ronda.formatoSerie && <StatusBadge valor={ronda.formatoSerie} />}</h4><ul className="lista">{ronda.llaves.map((llave) => <li key={llave.id}>{llave.participacionLocal?.equipo.nombre ?? 'A definir'} vs {llave.participacionVisitante?.equipo.nombre ?? 'A definir'} <StatusBadge valor={llave.estado} />{llave.partidos?.map((partido) => <span key={partido.id}> · {partido.ordenSerie === 1 ? 'Ida' : 'Vuelta'} {partido.golesLocal ?? '-'}-{partido.golesVisitante ?? '-'}</span>)}{llave.definicion?.tipo === 'PENALES' && ` · Penales ${llave.definicion.penalesLocal}-${llave.definicion.penalesVisitante}`}{llave.definicion?.tipo === 'ADMINISTRATIVA' && ' · Definición administrativa'}{llave.ganadorParticipacion && ` · Ganador: ${llave.ganadorParticipacion.equipo.nombre}`}</li>)}</ul></section>)}
  </article>)}</div>
}

export default function PublicResourcePage() {
  const location = useLocation()
  const params = useParams<{ id: string }>()
  const [data, setData] = useState<Dato | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ruta = location.pathname.includes('/temporadas/')
    ? `/publico/temporadas/${params.id}/categorias`
    : location.pathname.endsWith('/fases')
      ? `/publico/torneo-categorias/${params.id}/fases`
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
            : location.pathname.endsWith('/fases')
              ? 'Fases de competencia'
              : location.pathname.includes('/equipos/')
              ? 'Equipo'
              : 'Competencia'}
        </h2>
        {error ? (
          <PageState tipo="error" detalle={error} onReintentar={cargar} />
        ) : data === null ? (
          <PageState tipo="cargando" />
        ) : (
          location.pathname.endsWith('/fases') && Array.isArray(data) ? <FasesPublicas fases={data as FasePublica[]} /> : <ValorPublico valor={data} />
        )}
      </div>
    </main>
  )
}
