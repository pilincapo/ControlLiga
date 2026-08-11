import { useEffect, useState } from 'react'
import { PERMISOS } from '@controlliga/shared'
import { useAuth } from '../../auth/useAuth'
import ConfirmDialog from '../../components/ConfirmDialog'
import PageState from '../../components/PageState'
import ResponsiveTable from '../../components/ResponsiveTable'
import StatusBadge from '../../components/StatusBadge'
import { apiFetch } from '../../utils/api'

type Props = { competenciaId: string | null; zonaId?: string }
type Fixture = {
  jornadas: Array<{
    id: string
    numero: number
    descansos: Array<{ equipo: { nombre: string } }>
    partidos: Array<{
      equipoLocal: { nombre: string } | null
      equipoVisitante: { nombre: string } | null
      estado: string
      golesLocal: number | null
      golesVisitante: number | null
    }>
  }>
}
type Tabla = {
  filas: Array<{
    posicion: number
    equipo: { nombre: string }
    PJ: number
    PG: number
    PE: number
    PP: number
    GF: number
    GC: number
    DG: number
    PTS: number
  }>
  criteriosNoDisponibles: string[]
}

export default function FixtureTablaSection({ competenciaId, zonaId }: Props) {
  const [fixture, setFixture] = useState<Fixture | null>(null)
  const [tabla, setTabla] = useState<Tabla | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmacion, setConfirmacion] = useState<'generar' | 'regenerar' | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const { usuario } = useAuth()
  const esAdmin =
    usuario?.permisos.includes(PERMISOS.global) ||
    usuario?.permisos.includes(PERMISOS.torneosAdministrar)

  function cargar() {
    if (!competenciaId) return
    const query = zonaId ? `?zonaId=${zonaId}` : ''
    setError(null)
    Promise.all([
      apiFetch<Fixture>(`/torneo-categorias/${competenciaId}/fixture${query}`),
      apiFetch<Tabla>(`/torneo-categorias/${competenciaId}/tabla${query}`),
    ])
      .then(([nuevoFixture, nuevaTabla]) => {
        setFixture(nuevoFixture)
        setTabla(nuevaTabla)
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'No se pudo cargar fixture y tabla'),
      )
  }

  useEffect(() => {
    if (!competenciaId) return
    let activo = true
    const query = zonaId ? `?zonaId=${zonaId}` : ''
    Promise.all([
      apiFetch<Fixture>(`/torneo-categorias/${competenciaId}/fixture${query}`),
      apiFetch<Tabla>(`/torneo-categorias/${competenciaId}/tabla${query}`),
    ])
      .then(([nuevoFixture, nuevaTabla]) => {
        if (activo) {
          setFixture(nuevoFixture)
          setTabla(nuevaTabla)
        }
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : 'No se pudo cargar fixture y tabla')
      })
    return () => {
      activo = false
    }
  }, [competenciaId, zonaId])

  async function confirmar() {
    if (!competenciaId || !confirmacion) return
    setOcupado(true)
    try {
      await apiFetch(`/torneo-categorias/${competenciaId}/fixture/${confirmacion}`, {
        method: 'POST',
        body: JSON.stringify({ zonaId, confirmar: true }),
      })
      setConfirmacion(null)
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar fixture')
    } finally {
      setOcupado(false)
    }
  }

  if (!competenciaId)
    return (
      <div className="tarjeta">
        <PageState
          tipo="vacio"
          detalle="Seleccioná una competencia para consultar fixture y posiciones."
        />
      </div>
    )

  return (
    <div className="tarjeta">
      <div className="titulo-acciones">
        <h3>Fixture y tabla</h3>
        {esAdmin && (
          <button
            className="boton boton-primario"
            onClick={() => setConfirmacion(fixture?.jornadas.length ? 'regenerar' : 'generar')}
          >
            {fixture?.jornadas.length ? 'Regenerar fixture' : 'Generar fixture'}
          </button>
        )}
      </div>
      {error && <PageState tipo="error" detalle={error} onReintentar={cargar} />}
      {!error && !fixture && <PageState tipo="cargando" />}
      {fixture?.jornadas.map((jornada) => (
        <section className="jornada" key={jornada.id}>
          <h4>Jornada {jornada.numero}</h4>
          {jornada.descansos.length > 0 && (
            <p>
              Descansa: {jornada.descansos.map((descanso) => descanso.equipo.nombre).join(', ')}
            </p>
          )}
          <ul className="lista">
            {jornada.partidos.map((partido, indice) => (
              <li key={indice}>
                <strong>{partido.equipoLocal?.nombre ?? 'A definir'}</strong>{' '}
                {partido.golesLocal ?? '-'} - {partido.golesVisitante ?? '-'}{' '}
                <strong>{partido.equipoVisitante?.nombre ?? 'A definir'}</strong>{' '}
                <StatusBadge valor={partido.estado} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {tabla && (
        <>
          <h4>Posiciones</h4>
          <ResponsiveTable etiqueta="Tabla de posiciones">
            <thead>
              <tr>
                {['#', 'Equipo', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'PTS'].map((titulo) => (
                  <th key={titulo}>{titulo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabla.filas.map((fila) => (
                <tr key={fila.equipo.nombre}>
                  <td>{fila.posicion}</td>
                  <td>{fila.equipo.nombre}</td>
                  <td>{fila.PJ}</td>
                  <td>{fila.PG}</td>
                  <td>{fila.PE}</td>
                  <td>{fila.PP}</td>
                  <td>{fila.GF}</td>
                  <td>{fila.GC}</td>
                  <td>{fila.DG}</td>
                  <td>{fila.PTS}</td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
          {tabla.criteriosNoDisponibles.length > 0 && (
            <small>No disponible: {tabla.criteriosNoDisponibles.join(', ')}</small>
          )}
        </>
      )}
      <ConfirmDialog
        abierto={confirmacion !== null}
        titulo={confirmacion === 'regenerar' ? 'Regenerar fixture' : 'Generar fixture'}
        detalle={
          confirmacion === 'regenerar'
            ? 'Reemplazará jornadas sin partidos operativos. Esta acción queda auditada.'
            : 'Creará jornadas y partidos para esta competencia.'
        }
        confirmar={confirmacion === 'regenerar' ? 'Regenerar' : 'Generar'}
        ocupado={ocupado}
        onConfirmar={() => void confirmar()}
        onCancelar={() => setConfirmacion(null)}
      />
    </div>
  )
}
