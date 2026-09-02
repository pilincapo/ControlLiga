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

type Operacion = { tipo: 'crear'; fase: 'GRUPOS' | 'ELIMINACION_DIRECTA' } | { tipo: 'regenerar' | 'clasificar' | 'invalidar'; faseId: string } | null
type PreviewClasificacion = { candidatos: Array<{ participacionId: string; posicion: number; seed: number; etiquetaOrigen: string }> }

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
  const [faseOrigenId, setFaseOrigenId] = useState('')
  const [faseDestinoId, setFaseDestinoId] = useState('')
  const [tipoRegla, setTipoRegla] = useState<'POSICION_GRUPO' | 'MEJORES_ENTRE_GRUPOS' | 'POSICION_GENERAL'>('POSICION_GRUPO')
  const [grupoOrigenId, setGrupoOrigenId] = useState('')
  const [posicionDesde, setPosicionDesde] = useState(1)
  const [posicionHasta, setPosicionHasta] = useState(1)
  const [cantidad, setCantidad] = useState(1)
  const [formatoSerie, setFormatoSerie] = useState<'PARTIDO_UNICO' | 'IDA_VUELTA'>('PARTIDO_UNICO')
  const [permiteAlargue, setPermiteAlargue] = useState(false)
  const [permitePenales, setPermitePenales] = useState(true)
  const [tercerPuesto, setTercerPuesto] = useState(false)
  const [seedInicio, setSeedInicio] = useState(1)
  const [seedTipo, setSeedTipo] = useState<'ORDEN_CLASIFICACION' | 'CRUCE_EXPLICITO'>('ORDEN_CLASIFICACION')
  const [preview, setPreview] = useState<{ faseId: string; candidatos: PreviewClasificacion['candidatos'] } | null>(null)
  const permitido = Boolean(usuario?.permisos.includes(PERMISOS.global) || usuario?.permisos.includes(PERMISOS.torneosAdministrar))
  const confirmadas = participaciones.filter((p) => p.torneoCategoriaId === competicionId && p.estado === 'CONFIRMADO')
  const participacionesEnGrupos = new Set(fases?.flatMap((fase) => fase.grupos.flatMap((grupo) => grupo.participaciones.map((participacion) => participacion.id))) ?? [])
  const elegiblesParaGrupos = confirmadas.filter((p) => !participacionesEnGrupos.has(p.id))
  const gruposValidos = nombresGrupo.slice(0, cantidadGrupos).every((_, indice) => elegiblesParaGrupos.filter((p, posicion) => (asignaciones[p.id] ?? posicion % cantidadGrupos) === indice).length >= 2)
  const seedsActuales = seeds.length ? seeds : confirmadas.map((p) => p.id)
  const eliminacionValida = seedsActuales.length >= 4 && seedsActuales.length <= 16
  const faseOrigen = fases?.find((fase) => fase.id === faseOrigenId)
  const destinosDisponibles = fases?.filter((fase) => fase.id !== faseOrigenId && fase.estado === 'BORRADOR') ?? []

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
      } else if (operacion.tipo === 'clasificar' || operacion.tipo === 'invalidar') {
        const ruta = operacion.tipo === 'clasificar' ? 'clasificar' : 'invalidar-clasificacion'
        await apiFetch(`/fases-competencia/${operacion.faseId}/${ruta}`, { method: 'POST', body: JSON.stringify({ confirmar: true }) })
        setToast(operacion.tipo === 'clasificar' ? 'Clasificación confirmada' : 'Clasificación invalidada')
        setPreview(null)
      } else if (operacion.tipo === 'crear') {
        const orden = (fases?.at(-1)?.orden ?? 0) + 1
        const body = operacion.fase === 'GRUPOS'
          ? {
              tipo: 'GRUPOS', orden, nombre: `Fase de grupos ${orden}`, ruedas: 1, confirmar: true,
               grupos: nombresGrupo.slice(0, cantidadGrupos).map((nombre, indice) => ({ nombre, participacionIds: confirmadas.filter((p, posicion) => (asignaciones[p.id] ?? posicion % cantidadGrupos) === indice).map((p) => p.id) })),
            }
          : {
              tipo: 'ELIMINACION_DIRECTA', orden, nombre: `Eliminación directa ${orden}`, confirmar: true,
                seeds: seedsActuales.map((participacionId, indice) => ({ participacionId, seed: indice + 1 })),
                configuracion: { rondas: [{ orden: 1, formatoSerie, permiteAlargue, permitePenales }], tercerPuesto },
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

  async function crearRegla() {
    if (!faseOrigen || !faseDestinoId) return
    setOcupado(true)
    setError(null)
    try {
      await apiFetch(`/fases-competencia/${faseOrigen.id}/reglas-clasificacion`, {
        method: 'POST',
        body: JSON.stringify({
          faseDestinoId, orden: (faseOrigen.reglasClasificacionOrigen ?? []).length + 1, tipo: tipoRegla,
          posicionDesde, posicionHasta, ...(tipoRegla === 'MEJORES_ENTRE_GRUPOS' ? { cantidad } : {}),
          ...(tipoRegla === 'POSICION_GRUPO' ? { grupoCompetenciaId: grupoOrigenId } : {}),
          seedTipo, seedInicio,
        }),
      })
      setToast('Regla de clasificación creada')
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la regla')
    } finally {
      setOcupado(false)
    }
  }

  async function cargarPreview(faseId: string) {
    setError(null)
    try {
      const data = await apiFetch<PreviewClasificacion>(`/fases-competencia/${faseId}/clasificacion/preview`)
      setPreview({ faseId, candidatos: data.candidatos })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo previsualizar la clasificación')
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
        ) : (<>
          <ol className="lista">
            {seedsActuales.map((id, indice) => {
              const participacion = confirmadas.find((item) => item.id === id)
              return <li key={id}>Seed {indice + 1}: <strong>{participacion?.equipo.nombre}</strong> <button className="boton" disabled={indice === 0} onClick={() => moverSeed(indice, -1)}>Subir</button> <button className="boton" disabled={indice === seedsActuales.length - 1} onClick={() => moverSeed(indice, 1)}>Bajar</button></li>
            })}
          </ol>
          <div className="campo"><label htmlFor="formato-serie">Formato de serie</label><select id="formato-serie" value={formatoSerie} onChange={(e) => setFormatoSerie(e.target.value as typeof formatoSerie)}><option value="PARTIDO_UNICO">Partido único</option><option value="IDA_VUELTA">Ida y vuelta</option></select></div>
          <label><input type="checkbox" checked={permiteAlargue} onChange={(e) => setPermiteAlargue(e.target.checked)} /> Permite alargue</label>
          <label><input type="checkbox" checked={permitePenales} onChange={(e) => setPermitePenales(e.target.checked)} /> Permite penales</label>
          <label><input type="checkbox" checked={tercerPuesto} onChange={(e) => setTercerPuesto(e.target.checked)} /> Generar tercer puesto</label>
        </>)}
        {confirmadas.length === 0 ? <PageState tipo="vacio" detalle="Esta competencia no tiene participaciones confirmadas." /> : tipo === 'GRUPOS' && elegiblesParaGrupos.length === 0 ? <PageState tipo="vacio" detalle="Todas las participaciones confirmadas ya pertenecen a un grupo." /> : <>
          {tipo === 'GRUPOS' && !gruposValidos && <p className="error">Cada grupo requiere al menos dos participaciones.</p>}
          {tipo === 'ELIMINACION_DIRECTA' && !eliminacionValida && <p className="error">La eliminación directa requiere entre cuatro y dieciséis seeds.</p>}
          <button className="boton boton-primario" disabled={tipo === 'GRUPOS' ? !gruposValidos : !eliminacionValida} onClick={() => setOperacion({ tipo: 'crear', fase: tipo })}>Generar fase</button>
        </>}
      </PermissionGate>
      <PermissionGate permitido={permitido}>
        <section className="jornada">
          <h4>Regla de clasificación</h4>
           <div className="campo"><label htmlFor="regla-origen">Fase origen</label><select id="regla-origen" value={faseOrigenId} onChange={(e) => { setFaseOrigenId(e.target.value); setGrupoOrigenId(''); setFaseDestinoId('') }}><option value="">Seleccioná fase</option>{fases?.filter((fase) => ['BORRADOR', 'GENERADA', 'FINALIZADA'].includes(fase.estado)).map((fase) => <option key={fase.id} value={fase.id}>{fase.orden}. {fase.nombre}</option>)}</select></div>
          {faseOrigen && <>
            <div className="campo"><label htmlFor="regla-destino">Fase destino</label><select id="regla-destino" value={faseDestinoId} onChange={(e) => setFaseDestinoId(e.target.value)}><option value="">Seleccioná fase</option>{destinosDisponibles.map((fase) => <option key={fase.id} value={fase.id}>{fase.orden}. {fase.nombre}</option>)}</select></div>
            <div className="campo"><label htmlFor="regla-tipo">Criterio</label><select id="regla-tipo" value={tipoRegla} onChange={(e) => setTipoRegla(e.target.value as typeof tipoRegla)}><option value="POSICION_GRUPO">Posición de grupo</option><option value="MEJORES_ENTRE_GRUPOS">Mejores entre grupos</option><option value="POSICION_GENERAL">Posición general</option></select></div>
            {tipoRegla === 'POSICION_GRUPO' && <div className="campo"><label htmlFor="regla-grupo">Grupo origen</label><select id="regla-grupo" value={grupoOrigenId} onChange={(e) => setGrupoOrigenId(e.target.value)}><option value="">Seleccioná grupo</option>{faseOrigen.grupos.map((grupo) => <option key={grupo.id} value={grupo.id}>Grupo {grupo.nombre}</option>)}</select></div>}
            <div className="campo"><label htmlFor="regla-desde">Posición desde</label><input id="regla-desde" type="number" min="1" value={posicionDesde} onChange={(e) => setPosicionDesde(Number(e.target.value))} /></div>
            <div className="campo"><label htmlFor="regla-hasta">Posición hasta</label><input id="regla-hasta" type="number" min={posicionDesde} value={posicionHasta} onChange={(e) => setPosicionHasta(Number(e.target.value))} /></div>
            {tipoRegla === 'MEJORES_ENTRE_GRUPOS' && <div className="campo"><label htmlFor="regla-cantidad">Cantidad</label><input id="regla-cantidad" type="number" min="1" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} /></div>}
            <div className="campo"><label htmlFor="regla-seed">Seed inicial</label><input id="regla-seed" type="number" min="1" value={seedInicio} onChange={(e) => setSeedInicio(Number(e.target.value))} /></div>
            <div className="campo"><label htmlFor="regla-seed-tipo">Orden de seeds</label><select id="regla-seed-tipo" value={seedTipo} onChange={(e) => setSeedTipo(e.target.value as typeof seedTipo)}><option value="ORDEN_CLASIFICACION">Orden de clasificación</option><option value="CRUCE_EXPLICITO">Cruce explícito</option></select></div>
            <button className="boton boton-primario" disabled={ocupado || !faseDestinoId || (tipoRegla === 'POSICION_GRUPO' && !grupoOrigenId) || posicionHasta < posicionDesde} onClick={() => void crearRegla()}>Crear regla</button>
          </>}
        </section>
      </PermissionGate>
      {fases?.length === 0 && <PageState tipo="vacio" detalle="Todavía no se generaron fases para esta competencia." />}
      {fases?.map((fase) => (
        <article className="jornada" key={fase.id}>
          <h4>{fase.orden}. {fase.nombre} <StatusBadge valor={fase.tipo} /> <StatusBadge valor={fase.estado} /></h4>
          {fase.grupos.map((grupo) => <p key={grupo.id}><strong>Grupo {grupo.nombre}:</strong> {grupo.participaciones.map((p) => p.equipo.nombre).join(', ')}</p>)}
          {(fase.participantesFase?.length ?? 0) > 0 && <section><h5>Participantes clasificados</h5><ul className="lista">{fase.participantesFase.map((participante) => <li key={participante.id}><strong>{participante.participacion.equipo.nombre}</strong>{participante.seed !== null && ` · Seed ${participante.seed}`}{participante.clasificadoOrigen && ` · ${participante.clasificadoOrigen.etiquetaOrigen}`}</li>)}</ul></section>}
          {(fase.reglasClasificacionOrigen?.length ?? 0) > 0 && <section><h5>Reglas de clasificación</h5><ul className="lista">{fase.reglasClasificacionOrigen.map((regla) => <li key={regla.id}>{regla.tipo.replaceAll('_', ' ').toLowerCase()} · posiciones {regla.posicionDesde}-{regla.posicionHasta}{regla.cantidad && ` · ${regla.cantidad} cupos`} · destino: {fases?.find((destino) => destino.id === regla.faseDestinoId)?.nombre ?? 'Fase destino'} · seed {regla.seedInicio} <StatusBadge valor={regla.estado} />{regla.clasificados.length > 0 && <ul>{regla.clasificados.map((clasificado) => <li key={clasificado.id}>{confirmadas.find((p) => p.id === clasificado.participacionId)?.equipo.nombre ?? 'Participante'} · {clasificado.etiquetaOrigen} · Seed {clasificado.seed}</li>)}</ul>}</li>)}</ul></section>}
           {fase.rondas.map((ronda) => <section key={ronda.id}><h5>{ronda.nombre} {ronda.formatoSerie && <StatusBadge valor={ronda.formatoSerie} />}</h5><ul className="lista">{ronda.llaves.map((llave) => <li key={llave.id}><strong>{llave.participacionLocal?.equipo.nombre ?? 'A definir'}</strong>{llave.estado === 'BYE' ? ' — BYE' : <> vs <strong>{llave.participacionVisitante?.equipo.nombre ?? 'A definir'}</strong></>} <StatusBadge valor={llave.estado} />{llave.partidos?.map((partido) => <span key={partido.id}> · {partido.ordenSerie === 1 ? 'Ida' : 'Vuelta'}: {partido.golesLocal ?? '-'}-{partido.golesVisitante ?? '-'}</span>)}{llave.definicion?.tipo === 'PENALES' && ` · Penales ${llave.definicion.penalesLocal}-${llave.definicion.penalesVisitante}`}{llave.definicion?.tipo === 'ADMINISTRATIVA' && ' · Definición administrativa'}{llave.ganadorParticipacion && ` Ganador: ${llave.ganadorParticipacion.equipo.nombre}`}</li>)}</ul></section>)}
          {preview?.faseId === fase.id && <section><h5>Vista previa</h5>{preview.candidatos.length === 0 ? <PageState tipo="vacio" detalle="No hay clasificados para las reglas actuales." /> : <ul className="lista">{preview.candidatos.map((candidato) => <li key={`${candidato.participacionId}-${candidato.seed}`}>{confirmadas.find((p) => p.id === candidato.participacionId)?.equipo.nombre ?? 'Participante'} · {candidato.etiquetaOrigen} · Seed {candidato.seed}</li>)}</ul>}</section>}
          <PermissionGate permitido={permitido}><div className="acciones"><button className="boton" onClick={() => void cargarPreview(fase.id)}>Previsualizar clasificación</button><button className="boton boton-primario" disabled={(fase.reglasClasificacionOrigen?.length ?? 0) === 0} onClick={() => setOperacion({ tipo: 'clasificar', faseId: fase.id })}>Confirmar clasificación</button><button className="boton boton-peligro" onClick={() => setOperacion({ tipo: 'invalidar', faseId: fase.id })}>Invalidar clasificación</button><button className="boton" onClick={() => setOperacion({ tipo: 'regenerar', faseId: fase.id })}>Regenerar fase</button></div></PermissionGate>
        </article>
      ))}
      <ConfirmDialog
        abierto={operacion !== null}
        titulo={operacion?.tipo === 'regenerar' ? 'Regenerar fase' : operacion?.tipo === 'clasificar' ? 'Confirmar clasificación' : operacion?.tipo === 'invalidar' ? 'Invalidar clasificación' : 'Generar fase'}
        detalle={operacion?.tipo === 'regenerar' ? 'Reemplazará estructura sin actividad. La acción se bloqueará si existe historial.' : operacion?.tipo === 'clasificar' ? 'Materializará los clasificados y sus seeds en fases destino.' : operacion?.tipo === 'invalidar' ? 'Eliminará clasificados y fases destino sin actividad. La acción se bloqueará si existe historial.' : 'Creará partidos y llaves usando las participaciones seleccionadas.'}
        confirmar={operacion?.tipo === 'regenerar' ? 'Regenerar' : operacion?.tipo === 'clasificar' ? 'Clasificar' : operacion?.tipo === 'invalidar' ? 'Invalidar' : 'Generar'}
        ocupado={ocupado}
        onConfirmar={() => void confirmar()}
        onCancelar={() => setOperacion(null)}
      />
    </section>
  )
}
