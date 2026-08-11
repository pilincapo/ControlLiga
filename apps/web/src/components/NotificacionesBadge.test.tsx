import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotificacionesBadge from './NotificacionesBadge'
import { apiFetch } from '../utils/api'
import { EVENTO_NOTIFICACIONES_ACTUALIZADAS } from '../utils/notificaciones'

vi.mock('../utils/api', () => ({ apiFetch: vi.fn() }))

const mockApiFetch = vi.mocked(apiFetch)

describe('NotificacionesBadge', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
  })

  it('no muestra badge cuando el contador es 0', async () => {
    mockApiFetch.mockResolvedValueOnce({ count: 0 })
    render(
      <MemoryRouter>
        <NotificacionesBadge />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Notificaciones')).toBeInTheDocument()
    expect(screen.queryByTestId('badge-no-leidas')).not.toBeInTheDocument()
  })

  it('muestra el contador cuando hay no leídas', async () => {
    mockApiFetch.mockResolvedValueOnce({ count: 3 })
    render(
      <MemoryRouter>
        <NotificacionesBadge />
      </MemoryRouter>,
    )
    expect(await screen.findByTestId('badge-no-leidas')).toHaveTextContent('3')
  })

  it('actualiza el contador cuando se emite el evento de actualización', async () => {
    mockApiFetch.mockResolvedValueOnce({ count: 1 })
    render(
      <MemoryRouter>
        <NotificacionesBadge />
      </MemoryRouter>,
    )
    expect(await screen.findByTestId('badge-no-leidas')).toHaveTextContent('1')
    mockApiFetch.mockResolvedValueOnce({ count: 0 })
    act(() => {
      window.dispatchEvent(new CustomEvent(EVENTO_NOTIFICACIONES_ACTUALIZADAS))
    })
    expect(await screen.findByText('Notificaciones')).toBeInTheDocument()
    await vi.waitFor(() => {
      expect(screen.queryByTestId('badge-no-leidas')).not.toBeInTheDocument()
    })
  })

  it('no rompe si la API falla', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Error de red'))
    render(
      <MemoryRouter>
        <NotificacionesBadge />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Notificaciones')).toBeInTheDocument()
    expect(screen.queryByTestId('badge-no-leidas')).not.toBeInTheDocument()
  })
})
