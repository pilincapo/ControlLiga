import { ApiError } from '@controlliga/shared'

export function resolveApiUrl(raw: string | undefined): string {
  return raw && raw.trim().length > 0 ? raw : '/api'
}

const API_URL = resolveApiUrl(import.meta.env.VITE_API_URL as string | undefined)

interface Opciones extends RequestInit {
  skipRefresh?: boolean
}

async function procesar<T>(res: Response): Promise<T> {
  const texto = await res.text()
  let body: unknown = null
  if (texto) {
    try {
      body = JSON.parse(texto)
    } catch {
      body = null
    }
  }
  if (!res.ok) {
    const mensaje = (body as { error?: { message?: string } } | null)?.error?.message ?? res.statusText
    throw new ApiError(res.status, mensaje)
  }
  const data = (body as { data?: T } | null)?.data
  return data as T
}

export async function apiFetch<T>(path: string, options: Opciones = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`
  const init: RequestInit = {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  }

  let res = await fetch(url, init)

  if (res.status === 401 && !options.skipRefresh && !path.includes('/auth/refresh')) {
    try {
      const refresh = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (refresh.ok) {
        res = await fetch(url, init)
      }
    } catch {
      res = await fetch(url, init)
    }
  }

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:sesion-expirada'))
  }

  return procesar<T>(res)
}
