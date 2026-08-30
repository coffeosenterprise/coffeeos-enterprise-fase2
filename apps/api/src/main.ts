import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { StructuredLogger } from './common/logging/structured-logger.service';
import { GlobalExceptionFilter } from './common/exceptions/global-exception.filter';
import { validateEnvironmentOrExit } from './common/config/environment';

async function bootstrap(): Promise<void> {
  validateEnvironmentOrExit();

  const app = await NestFactory.create(AppModule, {
    logger: new StructuredLogger(),
  });

  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics', 'version'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());

  // OpenAPI -- documenta los endpoints de negocio de Fase 1 (Identity,
  // Tenant, Tenant Provisioning, Organization). El resto de módulos
  // no expone endpoints todavía (permanecen vacíos hasta su fase).
  const config = new DocumentBuilder()
    .setTitle('CoffeeOS Enterprise API')
    .setDescription(
      'API REST de CoffeeOS Enterprise. Fase 1 — Identity, Tenant y Organization implementados; el resto de módulos permanece vacío hasta su fase correspondiente.',
    )
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

bootstrap();
