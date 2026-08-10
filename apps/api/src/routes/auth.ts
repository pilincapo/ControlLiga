import type { FastifyInstance } from 'fastify'
import { setSessionCookie, clearSessionCookie } from '../auth/cookies.js'
import {
  aMeResponder,
  aSesionResponder,
  cerrarSesion,
  iniciarSesion,
  obtenerUsuarioSesion,
  registrarUsuario,
  rotarSesion,
  vincularJugador,
} from '../auth/servicio.js'
import { autenticar, getAuth } from '../plugins/auth.js'
import { noAutenticado } from '../http.js'

interface RegistroBody {
  email: string
  password: string
  nombre: string
  apellido: string
  jugadorId?: string
}

interface CredencialesBody {
  email: string
  password: string
}

interface VincularBody {
  jugadorId: string
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', async (request, reply) => {
    const body = request.body as RegistroBody
    const emitida = await registrarUsuario(body, request)
    setSessionCookie(reply, emitida.token, emitida.expiresAt)
    return reply.status(201).send({ data: aSesionResponder(emitida) })
  })

  app.post('/auth/login', async (request, reply) => {
    const body = request.body as CredencialesBody
    const emitida = await iniciarSesion(body, request)
    setSessionCookie(reply, emitida.token, emitida.expiresAt)
    return reply.send({ data: aSesionResponder(emitida) })
  })

  app.post('/auth/logout', async (request, reply) => {
    await cerrarSesion(request)
    clearSessionCookie(reply)
    return reply.status(204).send()
  })

  app.get('/auth/me', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const usuario = await obtenerUsuarioSesion(auth.usuarioId)
    return { data: aMeResponder(usuario) }
  })

  app.post('/auth/refresh', async (request, reply) => {
    const emitida = await rotarSesion(request)
    if (!emitida) {
      throw noAutenticado()
    }
    setSessionCookie(reply, emitida.token, emitida.expiresAt)
    return reply.send({ data: aSesionResponder(emitida) })
  })

  app.post('/auth/me/vincular-jugador', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const body = request.body as VincularBody
    const usuario = await vincularJugador(auth, body.jugadorId)
    return { data: aMeResponder(usuario) }
  })
}
