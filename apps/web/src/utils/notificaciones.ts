import { apiFetch } from './api'

export const EVENTO_NOTIFICACIONES_ACTUALIZADAS = 'controlliga:notificaciones-actualizadas'

export function emitirNotificacionesActualizadas(): void {
  window.dispatchEvent(new CustomEvent(EVENTO_NOTIFICACIONES_ACTUALIZADAS))
}

export interface ConteoNoLeidas {
  count: number
}

export async function cargarNoLeidas(): Promise<number> {
  const data = await apiFetch<ConteoNoLeidas>('/notificaciones/no-leidas')
  return data.count
}

export async function marcarTodasLeidas(): Promise<number> {
  const data = await apiFetch<{ marcadas: number }>('/notificaciones/leer-todas', { method: 'POST' })
  return data.marcadas
}

export async function marcarLeida(id: string): Promise<void> {
  await apiFetch(`/notificaciones/${id}/leida`, { method: 'POST' })
}
