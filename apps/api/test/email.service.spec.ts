import { EmailService } from '../src/common/email/email.service';

describe('EmailService', () => {
  it('registra el resultado SMTP sin exponer destinatario ni codigo', async () => {
    const service = new EmailService();
    const sendMail = jest.fn().mockResolvedValue({
      messageId: '<safe-message-id@mailjet.com>',
      accepted: ['persona@example.com'],
      rejected: [],
      response: '250 Message queued\r\nsuccessfully',
    });
    const log = jest.fn();

    (
      service as unknown as {
        transporter: { sendMail: typeof sendMail };
        logger: { log: typeof log };
      }
    ).transporter = { sendMail };
    (
      service as unknown as {
        logger: { log: typeof log };
      }
    ).logger = { log };

    await service.sendVerificationCode({
      email: 'persona@example.com',
      businessName: 'Negocio de prueba',
      code: '123456',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);

    const loggedMessage = log.mock.calls[0]?.[0] as string;
    expect(loggedMessage).toContain('verification_email_smtp_result');
    expect(loggedMessage).toContain('"acceptedCount":1');
    expect(loggedMessage).toContain('"rejectedCount":0');
    expect(loggedMessage).toContain('<safe-message-id@mailjet.com>');
    expect(loggedMessage).not.toContain('persona@example.com');
    expect(loggedMessage).not.toContain('123456');
    expect(loggedMessage).not.toContain('Negocio de prueba');
    expect(loggedMessage).not.toContain('\r');
    expect(loggedMessage).not.toContain('\n');
  });
});
