import type { FastifyInstance } from 'fastify'
import {
  DESEMPATES_DEFECTO,
  PERMISOS,
  SISTEMA_PUNTOS_DEFECTO,
  esFormatoCompetencia,
  validarConfiguracionFormato,
  validarDesempates,
  validarSistemaPuntos,
} from '@controlliga/shared'
import type { CriterioDesempate, FormatoCompetencia, SistemaPuntos } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth, requierePermiso } from '../plugins/auth.js'
import { esAdminDeTorneo, puedeVerTorneo } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import { EstadoTorneoCategoria } from '../generated/prisma/enums.js'

interface CrearCategoriaBody {
  nombre: string
  descripcion?: string
}

interface AsociarCategoriaBody {
  categoriaId: string
}

interface CambiarEstadoBody {
  estado: 'ACTIVA' | 'CERRADA'
}

interface ConfiguracionBody {
  formato?: FormatoCompetencia
  configuracionFormato?: unknown
  sistemaPuntos?: SistemaPuntos
  desempates?: CriterioDesempate[]
}

export async function torneoCategoriasRoutes(app: FastifyInstance): Promise<void> {
  app.get('/categorias', { preHandler: autenticar }, async () => {
    const categorias = await getPrisma().categoria.findMany({
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, descripcion: true },
    })
    return { data: categorias }
  })

  app.post('/categorias', { preHandler: requierePermiso(PERMISOS.torneosAdministrar, PERMISOS.organizacionesAdministrar) }, async (request) => {
    const auth = getAuth(request)
    const body = request.body as CrearCategoriaBody
    const nombre = body.nombre?.trim()
    if (!nombre || nombre.length < 2) {
      throw badRequest('El nombre es obligatorio')
    }
    const prisma = getPrisma()
    const existente = await prisma.categoria.findFirst({ where: { nombre }, select: { id: true } })
    if (existente) {
      throw conflicto('categoria_existente', 'Ya existe una categoría con ese nombre')
    }
    const categoria = await prisma.categoria.create({
      data: { nombre, descripcion: body.descripcion?.trim() || null },
    })
    await auditar(prisma, {
      entidad: 'Categoria',
      entidadId: categoria.id,
      accion: 'CREATE',
      usuarioId: auth.usuarioId,
      cambios: { nombre: categoria.nombre },
    })
    return { data: categoria }
  })

  app.post(
    '/torneos/:torneoId/temporadas/:temporadaId/categorias',
    { preHandler: requierePermiso(PERMISOS.torneosAdministrar) },
    async (request) => {
      const auth = getAuth(request)
      const { torneoId, temporadaId } = request.params as { torneoId: string; temporadaId: string }
      const body = request.body as AsociarCategoriaBody
      const prisma = getPrisma()
      if (!(await esAdminDeTorneo(prisma, auth, torneoId))) {
        throw prohibido('No tenés permiso para administrar ese torneo')
      }
      if (!body.categoriaId) {
        throw badRequest('La categoría es obligatoria')
      }
      const temporada = await prisma.temporada.findUnique({
        where: { id: temporadaId },
        select: { id: true, torneoId: true },
      })
      if (!temporada || temporada.torneoId !== torneoId) {
        throw noEncontrado('Temporada')
      }
      const categoria = await prisma.categoria.findUnique({ where: { id: body.categoriaId }, select: { id: true } })
      if (!categoria) {
        throw noEncontrado('Categoría')
      }

      const torneoCategoria = await prisma.$transaction(async (tx) => {
        const existente = await tx.torneoCategoria.findUnique({
          where: { torneoId_temporadaId_categoriaId: { torneoId, temporadaId, categoriaId: body.categoriaId } },
          select: { id: true },
        })
        if (existente) {
          throw conflicto('categoria_asociada', 'Esa categoría ya está asociada a la temporada')
        }
        const creada = await tx.torneoCategoria.create({
          data: { torneoId, temporadaId, categoriaId: body.categoriaId },
        })
        await tx.configuracionCompetencia.create({
          data: {
            torneoCategoriaId: creada.id,
            formato: 'TODOS_CONTRA_TODOS',
            sistemaPuntos: SISTEMA_PUNTOS_DEFECTO as never,
            desempates: DESEMPATES_DEFECTO as never,
          },
        })
        return creada
      })

      await auditar(prisma, {
        entidad: 'TorneoCategoria',
        entidadId: torneoCategoria.id,
        accion: 'CREATE',
        usuarioId: auth.usuarioId,
        cambios: { torneoId, temporadaId, categoriaId: body.categoriaId },
      })
      return { data: torneoCategoria }
    },
  )

  app.get('/torneo-categorias/:id', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const tc = await prisma.torneoCategoria.findUnique({
      where: { id },
      include: {
        categoria: true,
        temporada: { select: { id: true, nombre: true, torneoId: true } },
        configuracion: true,
        zonas: { orderBy: { createdAt: 'asc' } },
        participaciones: {
          include: { equipo: { select: { id: true, nombre: true, escudoUrl: true } } },
          orderBy: { fechaInscripcion: 'asc' },
        },
      },
    })
    if (!tc) {
      throw noEncontrado('Competición')
    }
    if (!(await puedeVerTorneo(prisma, auth, tc.temporada.torneoId))) {
      throw prohibido('No tenés acceso a esa competición')
    }
    return { data: tc }
  })

  app.patch(
    '/torneo-categorias/:id/estado',
    { preHandler: requierePermiso(PERMISOS.torneosAdministrar) },
    async (request) => {
      const auth = getAuth(request)
      const { id } = request.params as { id: string }
      const body = request.body as CambiarEstadoBody
      const prisma = getPrisma()
      const tc = await prisma.torneoCategoria.findUnique({
        where: { id },
        select: { id: true, temporada: { select: { torneoId: true } }, estado: true },
      })
      if (!tc) {
        throw noEncontrado('Competición')
      }
      if (!(await esAdminDeTorneo(prisma, auth, tc.temporada.torneoId))) {
        throw prohibido('No tenés permiso para administrar esa competición')
      }
      if (body.estado !== 'ACTIVA' && body.estado !== 'CERRADA') {
        throw badRequest('El estado no es válido')
      }
      const actualizado = await prisma.torneoCategoria.update({
        where: { id },
        data: { estado: body.estado as EstadoTorneoCategoria },
        select: { id: true, estado: true },
      })
      await auditar(prisma, {
        entidad: 'TorneoCategoria',
        entidadId: id,
        accion: 'UPDATE',
        usuarioId: auth.usuarioId,
        cambios: { estado: body.estado },
      })
      return { data: actualizado }
    },
  )

  app.patch(
    '/torneo-categorias/:id/configuracion',
    { preHandler: requierePermiso(PERMISOS.torneosAdministrar) },
    async (request) => {
      const auth = getAuth(request)
      const { id } = request.params as { id: string }
      const body = request.body as ConfiguracionBody
      const prisma = getPrisma()
      const tc = await prisma.torneoCategoria.findUnique({
        where: { id },
        select: { id: true, temporada: { select: { torneoId: true } }, configuracion: true },
      })
      if (!tc) {
        throw noEncontrado('Competición')
      }
      if (!(await esAdminDeTorneo(prisma, auth, tc.temporada.torneoId))) {
        throw prohibido('No tenés permiso para administrar esa competición')
      }
      if (
        body.formato === undefined &&
        body.configuracionFormato === undefined &&
        body.sistemaPuntos === undefined &&
        body.desempates === undefined
      ) {
        throw badRequest('No se envió ninguna configuración para modificar')
      }
      if (body.formato !== undefined && !esFormatoCompetencia(body.formato)) {
        throw badRequest('El formato no es válido')
      }
      if (body.sistemaPuntos !== undefined && !validarSistemaPuntos(body.sistemaPuntos)) {
        throw badRequest('El sistema de puntos no es válido (victoria/empate/derrota numéricos >= 0)')
      }
      if (body.desempates !== undefined && !validarDesempates(body.desempates)) {
        throw badRequest('La lista de desempates no es válida')
      }
      if (body.configuracionFormato !== undefined && !validarConfiguracionFormato(body.configuracionFormato)) {
        throw badRequest('La configuración de formato no es válida')
      }

      const actual = tc.configuracion
      const sistemaPuntos = {
        ...SISTEMA_PUNTOS_DEFECTO,
        ...(actual?.sistemaPuntos && typeof actual.sistemaPuntos === 'object' && !Array.isArray(actual.sistemaPuntos)
          ? (actual.sistemaPuntos as Partial<SistemaPuntos>)
          : {}),
        ...(body.sistemaPuntos ?? {}),
      }
      const desempates = body.desempates ?? (Array.isArray(actual?.desempates) ? (actual.desempates as CriterioDesempate[]) : DESEMPATES_DEFECTO)
      const configuracionFormato = body.configuracionFormato ?? (actual?.configuracionFormato ?? null)

      const config = await prisma.configuracionCompetencia.upsert({
        where: { torneoCategoriaId: id },
        update: {
          formato: body.formato ?? undefined,
          configuracionFormato: configuracionFormato as never,
          sistemaPuntos: sistemaPuntos as never,
          desempates: desempates as never,
        },
        create: {
          torneoCategoriaId: id,
          formato: body.formato ?? 'TODOS_CONTRA_TODOS',
          configuracionFormato: configuracionFormato as never,
          sistemaPuntos: sistemaPuntos as never,
          desempates: desempates as never,
        },
      })

      await auditar(prisma, {
        entidad: 'TorneoCategoria',
        entidadId: id,
        accion: 'UPDATE',
        usuarioId: auth.usuarioId,
        cambios: { configuracion: Object.keys(body) },
      })
      return { data: config }
    },
  )
}
