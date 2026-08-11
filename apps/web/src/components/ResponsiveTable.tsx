import type { ReactNode } from 'react'

export default function ResponsiveTable({
  etiqueta,
  children,
}: {
  etiqueta: string
  children: ReactNode
}) {
  return (
    <div className="tabla-responsive" role="region" aria-label={etiqueta} tabIndex={0}>
      <table>{children}</table>
    </div>
  )
}
