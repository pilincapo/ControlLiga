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

export const emailSenderDesarrollo = new EmailSenderDesarrollo()
export const emailSender: EmailSender = emailSenderDesarrollo
