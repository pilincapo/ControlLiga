import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../utils/api'
import PublicCompetitionPage from './PublicCompetitionPage'

vi.mock('../utils/api', () => ({ apiFetch: vi.fn() }))
const mockApiFetch = vi.mocked(apiFetch)

describe('PublicCompetitionPage', () => {
  beforeEach(() => mockApiFetch.mockReset())

  it('muestra fixture y tabla de la zona pública', async () => {
    mockApiFetch.mockImplementation((ruta) => {
      if (typeof ruta !== 'string' || ruta.includes('/zonas')) return Promise.resolve([{ id: 'zona-a', nombre: 'Zona A' }])
      if (ruta?.includes('/fixture')) return Promise.resolve({ jornadas: [{ id: 'j1', numero: 1, nombre: 'Apertura', fechaInicio: '2026-09-01T20:00:00.000Z', partidos: [{ id: 'p1', fechaHora: '2026-09-01T20:00:00.000Z', estado: 'FINALIZADO', golesLocal: 2, golesVisitante: 1, equipoLocal: { nombre: 'Azules' }, equipoVisitante: { nombre: 'Rojos' } }] }] })
      return Promise.resolve({ filas: [{ posicion: 1, equipo: { nombre: 'Azules' }, PJ: 1, PG: 1, PE: 0, PP: 0, GF: 2, GC: 1, DG: 1, PTS: 3 }], criteriosNoDisponibles: [] })
    })

    render(<MemoryRouter initialEntries={['/publico/competencias/c1']}><Routes><Route path="/publico/competencias/:id" element={<PublicCompetitionPage />} /></Routes></MemoryRouter>)

    expect(await screen.findByRole('link', { name: /Azules/i })).toBeInTheDocument()
    expect(screen.getByText('2—1')).toBeInTheDocument()
    expect(mockApiFetch).toHaveBeenCalledWith('/publico/torneo-categorias/c1/fixture?zonaId=zona-a')
  })
})
