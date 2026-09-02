import nodemailer from 'nodemailer'
import { env } from '../env.js'

export interface EmailRecuperacion {
  destinatario: string
  url: string
  expiraEn: Date
}

export interface EmailSender {
  enviarRecuperacion(datos: EmailRecuperacion): Promise<void>
}

// Adapter controlado: no imprime ni persiste el token en logs. Tests pueden inspeccionar último envío.
export class EmailSenderDesarrollo implements EmailSender {
  ultimo: EmailRecuperacion | null = null

  async enviarRecuperacion(datos: EmailRecuperacion): Promise<void> {
    this.ultimo = datos
  }
}

export class EmailSenderSmtp implements EmailSender {
  private transport: nodemailer.Transporter

  constructor() {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          }
        : undefined,
    })
  }

  async enviarRecuperacion(datos: EmailRecuperacion): Promise<void> {
    await this.transport.sendMail({
      from: env.EMAIL_FROM,
      to: datos.destinatario,
      subject: 'Recuperación de contraseña — ControlLiga',
      text: `Para recuperar tu contraseña, ingresá a este enlace (vence el ${datos.expiraEn.toISOString()}):\n\n${datos.url}`,
    })
  }
}

export const emailSenderDesarrollo = new EmailSenderDesarrollo()

export const emailSender: EmailSender =
  env.NODE_ENV === 'production' ? new EmailSenderSmtp() : emailSenderDesarrollo