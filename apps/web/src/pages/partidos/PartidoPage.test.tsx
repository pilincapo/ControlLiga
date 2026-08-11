import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../../auth/auth-context'
import type { AuthContextValue } from '../../auth/auth-context'
import { apiFetch } from '../../utils/api'
import PartidoPage from './PartidoPage'

vi.mock('../../utils/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../components/NotificacionesBadge', () => ({ default: () => null }))
const mockApiFetch = vi.mocked(apiFetch)
const partido = {
  id: 'p1',
  tipo: 'AMISTOSO',
  estado: 'EN_CURSO',
  publicada: false,
  fechaHora: '2026-08-11T10:00:00.000Z',
  lugar: null,
  golesLocal: null,
  golesVisitante: null,
  observaciones: null,
  arbitro: null,
  equipoLocal: { id: 'e1', nombre: 'Local', escudoUrl: null },
  equipoVisitante: { id: 'e2', nombre: 'Visita', escudoUrl: null },
  torneo: null,
  temporada: null,
  formacionInstancias: [
    {
      id: 'f1',
      jugadores: [
        {
          jugadorId: 'j1',
          jugador: { persona: { nombre: 'Juan', apellido: 'Pérez' } },
          dorsalSnapshot: 9,
          nombreSnapshot: 'Juan Pérez',
          esTitular: true,
          posicion: 'DELANTERO',
        },
      ],
    },
  ],
  convocatorias: [],
}

function renderPage(gestiona: boolean) {
  mockApiFetch.mockImplementation((url) => {
    const ruta = String(url)
    if (ruta.endsWith('/eventos'))
      return Promise.resolve([
        {
          id: 'ev1',
          tipo: 'GOL',
          equipoId: 'e1',
          jugadorId: 'j1',
          jugadorRelacionadoId: null,
          minuto: 12,
          periodo: null,
          subtipo: null,
          anulado: false,
        },
      ])
    if (ruta.endsWith('/estadisticas')) return Promise.resolve({ jugadores: [] })
    return Promise.resolve(partido)
  })
  const contexto: AuthContextValue = {
    usuario: {
      id: 'u',
      email: 'u@a.com',
      nombre: 'Ana',
      apellido: 'Test',
      jugadorId: null,
      roles: [],
      equipos: gestiona ? [{ equipoId: 'e1', nombre: 'Local', rolEnEquipo: 'DELEGADO' }] : [],
      permisos: [],
    },
    cargando: false,
    login: vi.fn(),
    registrar: vi.fn(),
    logout: vi.fn(),
    vincularJugador: vi.fn(),
  }
  render(
    <AuthContext.Provider value={contexto}>
      <MemoryRouter initialEntries={['/partidos/p1']}>
        <Routes>
          <Route path="/partidos/:id" element={<PartidoPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('PartidoPage eventos FASE 15', () => {
  beforeEach(() => mockApiFetch.mockReset())
  it('crea evento y confirma anulación', async () => {
    renderPage(true)
    await screen.findByText('Eventos')
    fireEvent.change(screen.getByLabelText('Equipo del evento'), { target: { value: 'e1' } })
    fireEvent.change(screen.getByLabelText('Jugador del evento'), { target: { value: 'j1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar evento' }))
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/partidos/p1/eventos',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Anular' }))
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(mockApiFetch).not.toHaveBeenCalledWith('/eventos-partido/ev1/anular', expect.anything())
  })
  it('oculta gestión sin permiso', async () => {
    renderPage(false)
    await screen.findByText('Eventos')
    expect(screen.queryByRole('button', { name: 'Agregar evento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
  })
})
