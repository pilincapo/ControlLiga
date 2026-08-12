import { useEffect, useState } from 'react'
import { PERMISOS } from '@controlliga/shared'
import { useAuth } from '../../auth/useAuth'
import ConfirmDialog from '../../components/ConfirmDialog'
import PageState from '../../components/PageState'
import PermissionGate from '../../components/PermissionGate'
import StatusBadge from '../../components/StatusBadge'
import ToastRegion from '../../components/ToastRegion'
import { apiFetch } from '../../utils/api'
import type { FaseCompetencia, Participacion } from './tipos'

interface Props {
  competicionId: string | null
  participaciones: Participacion[]
}

type Operacion = { tipo: 'crear'; fase: 'GRUPOS' | 'ELIMINACION_DIRECTA' } | { tipo: 'regenerar'; faseId: string } | null

const nombresGrupo = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export default function FasesCompetenciaSection({ competicionId, participaciones }: Props) {
  const { usuario } = useAuth()
  const [fases, setFases] = useState<FaseCompetencia[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [tipo, setTipo] = useState<'GRUPOS' | 'ELIMINACION_DIRECTA'>('GRUPOS')
  const [cantidadGrupos, setCantidadGrupos] = useState(2)
  const [asignaciones, setAsignaciones] = useState<Record<string, number>>({})
  const [seeds, setSeeds] = useState<string[]>([])
  const [operacion, setOperacion] = useState<Operacion>(null)
  const [ocupado, setOcupado] = useState(false)
  const permitido = Boolean(usuario?.permisos.includes(PERMISOS.global) || usuario?.permisos.includes(PERMISOS.torneosAdministrar))
  const confirmadas = participaciones.filter((p) => p.torneoCategoriaId === competicionId && p.estado === 'CONFIRMADO')
  const participacionesEnGrupos = new Set(fases?.flatMap((fase) => fase.grupos.flatMap((grupo) => grupo.participaciones.map((participacion) => participacion.id))) ?? [])
  const elegiblesParaGrupos = confirmadas.filter((p) => !participacionesEnGrupos.has(p.id))
  const gruposValidos = nombresGrupo.slice(0, cantidadGrupos).every((_, indice) => elegiblesParaGrupos.filter((p, posicion) => (asignaciones[p.id] ?? posicion % cantidadGrupos) === indice).length >= 2)
  const seedsActuales = seeds.length ? seeds : confirmadas.map((p) => p.id)
  const eliminacionValida = seedsActuales.length >= 4 && seedsActuales.length <= 16

  function cargar() {
    if (!competicionId) return
    setError(null)
    apiFetch<FaseCompetencia[]>(`/torneo-categorias/${competicionId}/competencia-avanzada`)
      .then(setFases)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudieron cargar las fases'))
  }

  useEffect(() => {
    if (!competicionId) return
    let activo = true
    apiFetch<FaseCompetencia[]>(`/torneo-categorias/${competicionId}/competencia-avanzada`)
      .then((data) => activo && setFases(data))
      .catch((e: unknown) => activo && setError(e instanceof Error ? e.message : 'No se pudieron cargar las fases'))
    return () => {
      activo = false
    }
  }, [competicionId])

  function moverSeed(indice: number, direccion: -1 | 1) {
    setSeeds((actuales) => {
      const destino = indice + direccion
      const siguiente = actuales.length ? [...actuales] : confirmadas.map((p) => p.id)
      if (destino < 0 || destino >= siguiente.length) return siguiente
      ;[siguiente[indice], siguiente[destino]] = [siguiente[destino], siguiente[indice]]
      return siguiente
    })
  }

  async function confirmar() {
    if (!competicionId || !operacion) return
    setOcupado(true)
    setError(null)
    try {
      if (operacion.tipo === 'regenerar') {
        await apiFetch(`/fases-competencia/${operacion.faseId}/regenerar`, { method: 'POST', body: JSON.stringify({ confirmar: true }) })
        setToast('Fase regenerada')
      } else {
        const orden = (fases?.at(-1)?.orden ?? 0) + 1
        const body = operacion.fase === 'GRUPOS'
          ? {
              tipo: 'GRUPOS', orden, nombre: `Fase de grupos ${orden}`, ruedas: 1, confirmar: true,
               grupos: nombresGrupo.slice(0, cantidadGrupos).map((nombre, indice) => ({ nombre, participacionIds: confirmadas.filter((p, posicion) => (asignaciones[p.id] ?? posicion % cantidadGrupos) === indice).map((p) => p.id) })),
            }
          : {
              tipo: 'ELIMINACION_DIRECTA', orden, nombre: `Eliminación directa ${orden}`, confirmar: true,
               seeds: seedsActuales.map((participacionId, indice) => ({ participacionId, seed: indice + 1 })),
            }
        await apiFetch(`/torneo-categorias/${competicionId}/fases/generar`, { method: 'POST', body: JSON.stringify(body) })
        setToast('Fase generada')
      }
      setOperacion(null)
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la fase')
    } finally {
      setOcupado(false)
    }
  }

  if (!competicionId) return <div className="tarjeta"><PageState tipo="vacio" detalle="Seleccioná una competencia para administrar sus fases." /></div>

  return (
    <section className="tarjeta">
      <h3>Fases de competencia</h3>
      <ToastRegion mensaje={toast} />
      {error && <PageState tipo="error" detalle={error} onReintentar={cargar} />}
      {!error && fases === null && <PageState tipo="cargando" />}
      <PermissionGate permitido={permitido} alternativo={<PageState tipo="prohibido" detalle="No tenés permiso para administrar fases." />}>
        <div className="campo">
          <label htmlFor="fase-tipo">Nueva fase</label>
          <select id="fase-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="GRUPOS">Grupos</option>
            <option value="ELIMINACION_DIRECTA">Eliminación directa</option>
          </select>
        </div>
        {tipo === 'GRUPOS' ? (
          <>
            <div className="campo">
              <label htmlFor="cantidad-grupos">Cantidad de grupos</label>
              <select id="cantidad-grupos" value={cantidadGrupos} onChange={(e) => setCantidadGrupos(Number(e.target.value))}>
                {[2, 3, 4, 5, 6, 7, 8].map((cantidad) => <option key={cantidad} value={cantidad}>{cantidad}</option>)}
              </select>
            </div>
            {elegiblesParaGrupos.map((participacion) => (
              <div className="campo" key={participacion.id}>
                <label htmlFor={`grupo-${participacion.id}`}>{participacion.equipo.nombre}</label>
                <select id={`grupo-${participacion.id}`} value={asignaciones[participacion.id] ?? confirmadas.indexOf(participacion) % cantidadGrupos} onChange={(e) => setAsignaciones({ ...asignaciones, [participacion.id]: Number(e.target.value) })}>
                  {nombresGrupo.slice(0, cantidadGrupos).map((nombre, indice) => <option key={nombre} value={indice}>Grupo {nombre}</option>)}
                </select>
              </div>
            ))}
          </>
        ) : (
          <ol className="lista">
            {seedsActuales.map((id, indice) => {
              const participacion = confirmadas.find((item) => item.id === id)
              return <li key={id}>Seed {indice + 1}: <strong>{participacion?.equipo.nombre}</strong> <button className="boton" disabled={indice === 0} onClick={() => moverSeed(indice, -1)}>Subir</button> <button className="boton" disabled={indice === seedsActuales.length - 1} onClick={() => moverSeed(indice, 1)}>Bajar</button></li>
            })}
          </ol>
        )}
        {confirmadas.length === 0 ? <PageState tipo="vacio" detalle="Esta competencia no tiene participaciones confirmadas." /> : tipo === 'GRUPOS' && elegiblesParaGrupos.length === 0 ? <PageState tipo="vacio" detalle="Todas las participaciones confirmadas ya pertenecen a un grupo." /> : <>
          {tipo === 'GRUPOS' && !gruposValidos && <p className="error">Cada grupo requiere al menos dos participaciones.</p>}
          {tipo === 'ELIMINACION_DIRECTA' && !eliminacionValida && <p className="error">La eliminación directa requiere entre cuatro y dieciséis seeds.</p>}
          <button className="boton boton-primario" disabled={tipo === 'GRUPOS' ? !gruposValidos : !eliminacionValida} onClick={() => setOperacion({ tipo: 'crear', fase: tipo })}>Generar fase</button>
        </>}
      </PermissionGate>
      {fases?.length === 0 && <PageState tipo="vacio" detalle="Todavía no se generaron fases para esta competencia." />}
      {fases?.map((fase) => (
        <article className="jornada" key={fase.id}>
          <h4>{fase.orden}. {fase.nombre} <StatusBadge valor={fase.tipo} /> <StatusBadge valor={fase.estado} /></h4>
          {fase.grupos.map((grupo) => <p key={grupo.id}><strong>Grupo {grupo.nombre}:</strong> {grupo.participaciones.map((p) => p.equipo.nombre).join(', ')}</p>)}
          {fase.rondas.map((ronda) => <section key={ronda.id}><h5>{ronda.nombre}</h5><ul className="lista">{ronda.llaves.map((llave) => <li key={llave.id}><strong>{llave.participacionLocal?.equipo.nombre ?? 'A definir'}</strong>{llave.estado === 'BYE' ? ' — BYE' : <> vs <strong>{llave.participacionVisitante?.equipo.nombre ?? 'A definir'}</strong></>} <StatusBadge valor={llave.estado} />{llave.ganadorParticipacion && ` Ganador: ${llave.ganadorParticipacion.equipo.nombre}`}</li>)}</ul></section>)}
          <PermissionGate permitido={permitido}><button className="boton" onClick={() => setOperacion({ tipo: 'regenerar', faseId: fase.id })}>Regenerar fase</button></PermissionGate>
        </article>
      ))}
      <ConfirmDialog
        abierto={operacion !== null}
        titulo={operacion?.tipo === 'regenerar' ? 'Regenerar fase' : 'Generar fase'}
        detalle={operacion?.tipo === 'regenerar' ? 'Reemplazará estructura sin actividad. La acción se bloqueará si existe historial.' : 'Creará partidos y llaves usando las participaciones seleccionadas.'}
        confirmar={operacion?.tipo === 'regenerar' ? 'Regenerar' : 'Generar'}
        ocupado={ocupado}
        onConfirmar={() => void confirmar()}
        onCancelar={() => setOperacion(null)}
      />
    </section>
  )
}
