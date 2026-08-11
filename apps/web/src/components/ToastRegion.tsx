interface Props {
  mensaje: string | null
  tipo?: 'exito' | 'error'
}

export default function ToastRegion({ mensaje, tipo = 'exito' }: Props) {
  if (!mensaje) return null
  return (
    <p
      className={`toast toast-${tipo}`}
      role={tipo === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {mensaje}
    </p>
  )
}
