import type { ReactNode } from 'react'

interface Props {
  tipo: 'cargando' | 'error' | 'vacio' | 'prohibido' | 'no-encontrado'
  titulo?: string
  detalle?: string
  accion?: ReactNode
  onReintentar?: () => void
}

const TITULOS: Record<Props['tipo'], string> = {
  cargando: 'Cargando información',
  error: 'No se pudo cargar esta información',
  vacio: 'Todavía no hay información',
  prohibido: 'No tenés acceso a este contenido',
  'no-encontrado': 'No encontramos este contenido',
}

export default function PageState({ tipo, titulo, detalle, accion, onReintentar }: Props) {
  return (
    <section className={`page-state page-state-${tipo}`} aria-busy={tipo === 'cargando'}>
      <h2>{titulo ?? TITULOS[tipo]}</h2>
      {detalle && <p>{detalle}</p>}
      {tipo === 'error' && onReintentar && (
        <button className="boton" onClick={onReintentar}>
          Reintentar
        </button>
      )}
      {accion}
    </section>
  )
}
