import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASSWORD
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD,
            }
          : undefined,
    });
  }

  async sendVerificationCode(input: {
    email: string;
    businessName: string;
    code: string;
  }): Promise<void> {
    const result = await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'CoffeeOS <no-reply@coffeeos.local>',
      to: input.email,
      subject: 'Tu codigo de verificacion de CoffeeOS',
      text:
        `Hola. Usa el codigo ${input.code} para verificar la cuenta de ` +
        `${input.businessName}. El codigo vence en 15 minutos.`,
      html:
        `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">` +
        `<h1 style="color:#194c3b">CoffeeOS</h1>` +
        `<p>Usa este codigo para verificar la cuenta de <strong>${this.escapeHtml(input.businessName)}</strong>:</p>` +
        `<p style="font-size:34px;font-weight:700;letter-spacing:8px;color:#c87b45">${input.code}</p>` +
        `<p>El codigo vence en 15 minutos. Si no solicitaste esta cuenta, ignora este mensaje.</p>` +
        `</div>`,
    });

    const acceptedCount = Array.isArray(result.accepted)
      ? result.accepted.length
      : 0;
    const rejectedCount = Array.isArray(result.rejected)
      ? result.rejected.length
      : 0;
    const response =
      typeof result.response === 'string'
        ? result.response.replace(/[\r\n]+/g, ' ').slice(0, 300)
        : undefined;

    this.logger.log(
      JSON.stringify({
        event: 'verification_email_smtp_result',
        messageId:
          typeof result.messageId === 'string' ? result.messageId : undefined,
        acceptedCount,
        rejectedCount,
        response,
      }),
    );
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      };
      return entities[character];
    });
  }
}
