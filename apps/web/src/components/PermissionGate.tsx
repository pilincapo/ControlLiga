import type { ReactNode } from 'react'

export default function PermissionGate({
  permitido,
  children,
  alternativo = null,
}: {
  permitido: boolean
  children: ReactNode
  alternativo?: ReactNode
}) {
  return <>{permitido ? children : alternativo}</>
}
