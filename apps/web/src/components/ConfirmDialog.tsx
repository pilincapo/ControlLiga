import { useEffect, useRef } from 'react'

interface Props {
  abierto: boolean
  titulo: string
  detalle: string
  confirmar: string
  ocupado?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

export default function ConfirmDialog({
  abierto,
  titulo,
  detalle,
  confirmar,
  ocupado = false,
  onConfirmar,
  onCancelar,
}: Props) {
  const cancelarRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!abierto) return
    cancelarRef.current?.focus()
    const onKeyDown = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && !ocupado) onCancelar()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [abierto, ocupado, onCancelar])

  if (!abierto) return null
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-titulo"
        aria-describedby="confirm-dialog-detalle"
      >
        <h2 id="confirm-dialog-titulo">{titulo}</h2>
        <p id="confirm-dialog-detalle">{detalle}</p>
        <div className="acciones">
          <button className="boton" ref={cancelarRef} onClick={onCancelar} disabled={ocupado}>
            Volver
          </button>
          <button className="boton boton-peligro" onClick={onConfirmar} disabled={ocupado}>
            {ocupado ? 'Procesando…' : confirmar}
          </button>
        </div>
      </section>
    </div>
  )
}
