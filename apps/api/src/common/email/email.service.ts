import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

interface MailjetMessageResult {
  Status?: string;
  To?: string;
  MessageID?: number | string;
  Errors?: Array<{ ErrorCode?: string; ErrorMessage?: string }>;
}

interface MailjetSendResponse {
  Messages?: MailjetMessageResult[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;
  private readonly mailjetEnabled: boolean;

  constructor() {
    this.mailjetEnabled = Boolean(
      process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY,
    );
    this.transporter = this.mailjetEnabled
      ? null
      : nodemailer.createTransport({
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
    const subject = 'Tu codigo de verificacion de CoffeeOS';
    const text =
      `Hola. Usa el codigo ${input.code} para verificar la cuenta de ` +
      `${input.businessName}. El codigo vence en 15 minutos.`;
    const html =
      `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">` +
      `<h1 style="color:#194c3b">CoffeeOS</h1>` +
      `<p>Usa este codigo para verificar la cuenta de <strong>${this.escapeHtml(input.businessName)}</strong>:</p>` +
      `<p style="font-size:34px;font-weight:700;letter-spacing:8px;color:#c87b45">${input.code}</p>` +
      `<p>El codigo vence en 15 minutos. Si no solicitaste esta cuenta, ignora este mensaje.</p>` +
      `</div>`;

    if (this.mailjetEnabled) {
      await this.sendWithMailjetApi({ ...input, subject, text, html });
      return;
    }

    await this.sendWithSmtp({ ...input, subject, text, html });
  }

  private async sendWithMailjetApi(input: {
    email: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void> {
    const fromEmail = process.env.MAILJET_FROM_EMAIL ?? this.getSmtpFromEmail();
    const fromName = process.env.MAILJET_FROM_NAME ?? 'CoffeeOS';
    const credentials = Buffer.from(
      `${process.env.MAILJET_API_KEY}:${process.env.MAILJET_SECRET_KEY}`,
    ).toString('base64');
    const response = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: fromEmail, Name: fromName },
            To: [{ Email: input.email }],
            Subject: input.subject,
            TextPart: input.text,
            HTMLPart: input.html,
          },
        ],
      }),
    });

    const payload = (await response
      .json()
      .catch(() => ({}))) as MailjetSendResponse;
    const message = payload.Messages?.[0];
    const status = message?.Status ?? `http_${response.status}`;
    const errorCode = message?.Errors?.[0]?.ErrorCode;

    this.logger.log(
      JSON.stringify({
        event: 'verification_email_mailjet_result',
        status,
        accepted: response.ok && status.toLowerCase() === 'success',
        messageId:
          typeof message?.MessageID === 'string' ||
          typeof message?.MessageID === 'number'
            ? message.MessageID
            : undefined,
        errorCode,
        httpStatus: response.status,
      }),
    );

    if (!response.ok || status.toLowerCase() !== 'success') {
      throw new Error(
        `Mailjet API no acepto el correo (HTTP ${response.status}, estado ${status})`,
      );
    }
  }

  private async sendWithSmtp(input: {
    email: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void> {
    if (!this.transporter) {
      throw new Error('Transporte de correo no configurado');
    }

    const result = await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'CoffeeOS <no-reply@coffeeos.local>',
      to: input.email,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    const acceptedCount = Array.isArray(result.accepted)
      ? result.accepted.length
      : 0;
    const rejectedCount = Array.isArray(result.rejected)
      ? result.rejected.length
      : 0;
    const smtpResponse =
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
        response: smtpResponse,
      }),
    );
  }

  private getSmtpFromEmail(): string {
    const configured = process.env.SMTP_FROM ?? 'no-reply@coffeeos.local';
    const match = configured.match(/<([^>]+)>/);
    return match?.[1] ?? configured.trim();
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
