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
import { autenticar as autenticarPassword } from '../plugins/auth.js'
import { cambiarPassword, resetearPassword, solicitarReset, resetRateLimitado } from '../auth/password-reset.js'
import { demasiadasSolicitudes } from '../http.js'

interface RegistroBody {
  email: string
  password: string
  nombre: string
  apellido: string
  jugadorId?: string
  dni?: string
}

interface CredencialesBody {
  email: string
  password: string
}

interface VincularBody {
  jugadorId: string
  dni?: string
}

interface ForgotBody { email: string }
interface ResetBody { token: string; password: string }
interface ChangePasswordBody { passwordActual: string; passwordNueva: string }

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
    const usuario = await vincularJugador(auth, body.jugadorId, body.dni)
    return { data: aMeResponder(usuario) }
  })

  app.post('/auth/password/forgot', async (request, reply) => {
    const body = request.body as ForgotBody
    await solicitarReset(typeof body?.email === 'string' ? body.email : '', request)
    return reply.status(202).send({ data: { mensaje: 'Si existe una cuenta, recibirás instrucciones para recuperar tu contraseña' } })
  })

  app.post('/auth/password/reset', async (request, reply) => {
    const body = request.body as ResetBody
    if (typeof body?.token !== 'string' || typeof body?.password !== 'string') {
      throw noAutenticado()
    }
    if (!resetRateLimitado(body.token, request)) throw demasiadasSolicitudes()
    await resetearPassword(body.token, body.password)
    return reply.send({ data: { mensaje: 'Contraseña actualizada. Iniciá sesión nuevamente' } })
  })

  app.post('/auth/password/change', { preHandler: autenticarPassword }, async (request, reply) => {
    const body = request.body as ChangePasswordBody
    const auth = getAuth(request)
    await cambiarPassword(auth.usuarioId, body.passwordActual, body.passwordNueva)
    clearSessionCookie(reply)
    return reply.send({ data: { mensaje: 'Contraseña actualizada. Iniciá sesión nuevamente' } })
  })
}
