import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../../auth/auth-context'
import type { AuthContextValue } from '../../auth/auth-context'
import { apiFetch } from '../../utils/api'
import EquipoPage from './EquipoPage'

vi.mock('../../utils/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../components/NotificacionesBadge', () => ({ default: () => null }))
const mockApiFetch = vi.mocked(apiFetch)
const equipo = {
  id: 'e1',
  nombre: 'Club',
  escudoUrl: null,
  descripcion: null,
  colorPrincipal: null,
  colorSecundario: null,
  categoriaHabitual: null,
  estado: 'ACTIVO',
  privado: false,
  configuracionPublica: null,
  telefono: null,
  email: null,
  administradores: [
    {
      id: 'a1',
      equipoId: 'e1',
      usuarioId: 'u2',
      rolEnEquipo: 'TECNICO',
      activo: true,
      fechaBaja: null,
      usuario: { id: 'u2', nombre: 'Luis', apellido: 'Admin', email: 'l@a.com' },
    },
  ],
  cantidades: { jugadores: 1, bajas: 0, administradores: 1, delegados: 1 },
}
const plantel = [
  {
    id: 'ej1',
    jugadorId: 'j1',
    nombre: 'Juan Pérez',
    dni: null,
    fotoUrl: null,
    dorsal: 9,
    posiciones: null,
    estado: 'ACTIVO',
    fechaIngreso: '2026-01-01',
    fechaSalida: null,
    motivoBaja: null,
    observaciones: null,
  },
]

function renderPage(gestiona: boolean) {
  mockApiFetch.mockImplementation((url) =>
    Promise.resolve(String(url).endsWith('/jugadores') ? plantel : equipo),
  )
  const contexto: AuthContextValue = {
    usuario: {
      id: 'u1',
      email: 'u@a.com',
      nombre: 'Ana',
      apellido: 'Test',
      jugadorId: null,
      roles: [],
      equipos: gestiona ? [{ equipoId: 'e1', nombre: 'Club', rolEnEquipo: 'DELEGADO' }] : [],
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
      <MemoryRouter initialEntries={['/equipos/e1']}>
        <Routes>
          <Route path="/equipos/:id" element={<EquipoPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('EquipoPage FASE 15', () => {
  beforeEach(() => mockApiFetch.mockReset())

  it('edita dorsal y baja mediante ConfirmDialog sin prompt', async () => {
    renderPage(true)
    await screen.findByText('Juan Pérez')
    fireEvent.click(screen.getByRole('button', { name: 'Dorsal' }))
    expect(screen.getByLabelText('Dorsal')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Dorsal'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar dorsal' }))
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/equipo-jugadores/ej1',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Baja' }))
    expect(screen.getByRole('dialog', { name: 'Dar de baja jugador' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(mockApiFetch).not.toHaveBeenCalledWith('/equipo-jugadores/ej1/baja', expect.anything())
  })

  it('oculta acciones administrativas sin rol de gestión', async () => {
    renderPage(false)
    await screen.findByText('Juan Pérez')
    expect(screen.queryByRole('button', { name: 'Dorsal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Baja' })).not.toBeInTheDocument()
  })
})
