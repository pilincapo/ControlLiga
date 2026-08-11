import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ConfirmDialog from './ConfirmDialog'
import PageState from './PageState'
import PermissionGate from './PermissionGate'
import ToastRegion from './ToastRegion'

describe('primitives UX FASE 15', () => {
  it('PageState expone error y permite reintentar', () => {
    const reintentar = vi.fn()
    render(<PageState tipo="error" detalle="Sin conexión" onReintentar={reintentar} />)
    expect(
      screen.getByRole('heading', { name: 'No se pudo cargar esta información' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reintentar).toHaveBeenCalledOnce()
  })

  it('ToastRegion usa región viva según resultado', () => {
    const { rerender } = render(<ToastRegion mensaje="Guardado" />)
    expect(screen.getByRole('status')).toHaveTextContent('Guardado')
    rerender(<ToastRegion mensaje="Falló" tipo="error" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Falló')
  })

  it('ConfirmDialog confirma, cancela y responde a Escape', () => {
    const confirmar = vi.fn()
    const cancelar = vi.fn()
    render(
      <ConfirmDialog
        abierto
        titulo="Eliminar"
        detalle="No se puede deshacer"
        confirmar="Eliminar"
        onConfirmar={confirmar}
        onCancelar={cancelar}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Eliminar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(confirmar).toHaveBeenCalledOnce()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(cancelar).toHaveBeenCalledOnce()
  })

  it('PermissionGate no monta acción no autorizada', () => {
    const { rerender } = render(
      <PermissionGate permitido={false} alternativo={<p>Sin permiso</p>}>
        <button>Gestionar</button>
      </PermissionGate>,
    )
    expect(screen.queryByRole('button', { name: 'Gestionar' })).not.toBeInTheDocument()
    expect(screen.getByText('Sin permiso')).toBeInTheDocument()
    rerender(
      <PermissionGate permitido>
        <button>Gestionar</button>
      </PermissionGate>,
    )
    expect(screen.getByRole('button', { name: 'Gestionar' })).toBeInTheDocument()
  })
})
