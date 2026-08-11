import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import InvitacionesPendientes from './InvitacionesPendientes'
import { apiFetch } from '../../utils/api'

vi.mock('../../utils/api', () => ({ apiFetch: vi.fn() }))

const mockApiFetch = vi.mocked(apiFetch)

describe('InvitacionesPendientes', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
    mockApiFetch.mockImplementation(() => Promise.resolve([]))
  })

  it('muestra solo invitaciones pendientes', async () => {
    mockApiFetch.mockImplementation(() =>
      Promise.resolve([
        { id: 'i1', tipo: 'JUGADOR', estado: 'PENDIENTE', rolEnEquipo: null, mensaje: null, expiraEn: null, respondidoEn: null, createdAt: '', equipo: { id: 'e1', nombre: 'Club A', escudoUrl: null } },
        { id: 'i2', tipo: 'CUERPO_TECNICO', estado: 'ACEPTADA', rolEnEquipo: 'TECNICO', mensaje: null, expiraEn: null, respondidoEn: null, createdAt: '', equipo: { id: 'e2', nombre: 'Club B', escudoUrl: null } },
      ]),
    )
    render(
      <MemoryRouter>
        <InvitacionesPendientes />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Club A')).toBeInTheDocument()
    expect(screen.queryByText('Club B')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument()
  })

  it('muestra estado vacío', async () => {
    render(
      <MemoryRouter>
        <InvitacionesPendientes />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/no tenés invitaciones pendientes/i)).toBeInTheDocument()
  })

  it('muestra error básico de API', async () => {
    mockApiFetch.mockImplementation(() => Promise.reject(new Error('Error de red')))
    render(
      <MemoryRouter>
        <InvitacionesPendientes />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Error de red')).toBeInTheDocument()
  })

  it('responde una invitación', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('/responder')) return Promise.resolve({})
      return Promise.resolve([
        { id: 'i1', tipo: 'JUGADOR', estado: 'PENDIENTE', rolEnEquipo: null, mensaje: null, expiraEn: null, respondidoEn: null, createdAt: '', equipo: { id: 'e1', nombre: 'Club A', escudoUrl: null } },
      ])
    })
    render(
      <MemoryRouter>
        <InvitacionesPendientes />
      </MemoryRouter>,
    )
    await screen.findByText('Club A')
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/invitaciones/i1/responder', {
        method: 'POST',
        body: JSON.stringify({ aceptar: false }),
      })
    })
  })
})
