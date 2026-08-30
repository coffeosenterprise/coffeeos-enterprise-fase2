/**
 * Prueba unitaria -- criterio de salida de Fase 1:
 * "Todos los errores incluyen Correlation ID."
 */
import { ArgumentsHost, ForbiddenException } from '@nestjs/common';
import { GlobalExceptionFilter } from '../src/common/exceptions/global-exception.filter';

describe('GlobalExceptionFilter', () => {
  it('incluye el correlationId de la request en la respuesta de error', () => {
    const filter = new GlobalExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          headers: { 'x-correlation-id': 'test-correlation-id' },
          url: '/api/v1/users/invite',
        }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new ForbiddenException('sin permiso'), host);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'test-correlation-id' }),
    );
  });
});
