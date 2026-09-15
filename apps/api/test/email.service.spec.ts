import { EmailService } from '../src/common/email/email.service';

describe('EmailService', () => {
  const originalEnvironment = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnvironment };
    jest.restoreAllMocks();
  });

  it('envia por Mailjet HTTPS y registra solo metadatos seguros', async () => {
    process.env.MAILJET_API_KEY = 'api-key-for-test';
    process.env.MAILJET_SECRET_KEY = 'secret-key-for-test';
    process.env.MAILJET_FROM_EMAIL = 'verified@example.com';
    process.env.MAILJET_FROM_NAME = 'CoffeeOS';

    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            Messages: [
              {
                Status: 'success',
                MessageID: 12345,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const service = new EmailService();
    const log = jest
      .spyOn(
        (service as unknown as { logger: { log: (...args: unknown[]) => void } })
          .logger,
        'log',
      )
      .mockImplementation(() => undefined);

    await service.sendVerificationCode({
      email: 'persona@example.com',
      businessName: 'Negocio de prueba',
      code: '123456',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.mailjet.com/v3.1/send',
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual(
      expect.objectContaining({ 'Content-Type': 'application/json' }),
    );
    expect(String(request.body)).toContain('persona@example.com');
    expect(String(request.body)).toContain('123456');

    const loggedMessage = log.mock.calls[0]?.[0] as string;
    expect(loggedMessage).toContain('verification_email_mailjet_result');
    expect(loggedMessage).toContain('"accepted":true');
    expect(loggedMessage).toContain('"messageId":12345');
    expect(loggedMessage).not.toContain('persona@example.com');
    expect(loggedMessage).not.toContain('123456');
    expect(loggedMessage).not.toContain('Negocio de prueba');
    expect(loggedMessage).not.toContain('api-key-for-test');
    expect(loggedMessage).not.toContain('secret-key-for-test');
  });

  it('usa SMTP local cuando no hay credenciales Mailjet', async () => {
    delete process.env.MAILJET_API_KEY;
    delete process.env.MAILJET_SECRET_KEY;
    const service = new EmailService();
    const sendMail = jest.fn().mockResolvedValue({
      messageId: '<safe-message-id@mailhog.local>',
      accepted: ['persona@example.com'],
      rejected: [],
      response: '250 Message queued\r\nsuccessfully',
    });
    const log = jest
      .spyOn(
        (service as unknown as { logger: { log: (...args: unknown[]) => void } })
          .logger,
        'log',
      )
      .mockImplementation(() => undefined);
    (
      service as unknown as {
        transporter: { sendMail: typeof sendMail };
      }
    ).transporter = { sendMail };

    await service.sendVerificationCode({
      email: 'persona@example.com',
      businessName: 'Negocio de prueba',
      code: '123456',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const loggedMessage = log.mock.calls[0]?.[0] as string;
    expect(loggedMessage).toContain('verification_email_smtp_result');
    expect(loggedMessage).toContain('"acceptedCount":1');
    expect(loggedMessage).not.toContain('persona@example.com');
    expect(loggedMessage).not.toContain('123456');
  });
});
