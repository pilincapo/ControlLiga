import type { Prisma } from '../generated/prisma/client.js'

export const SELECT_USUARIO_PUBLICO = {
  id: true,
  email: true,
  nombre: true,
  apellido: true,
  activo: true,
  jugadorId: true,
  createdAt: true,
  jugador: {
    select: {
      id: true,
      persona: { select: { nombre: true, apellido: true, dni: true } },
    },
  },
  roles: {
    where: { activo: true },
    include: { rol: true },
  },
  equipos: {
    where: { activo: true },
    include: { equipo: { select: { id: true, nombre: true } } },
  },
} satisfies Prisma.UsuarioSelect
