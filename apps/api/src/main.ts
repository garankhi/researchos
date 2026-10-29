import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor.js';
import { createOpenApiDocument } from './openapi.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? true,
  });

  // Global validation. `whitelist` strips properties that have no matching
  // DTO decorator, so a client cannot smuggle extra fields into a payload;
  // `forbidNonWhitelisted` turns that into an explicit error instead of
  // silently dropping data. `transform` lets DTOs coerce query and body
  // values into their declared types.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // Every successful response is wrapped in the API envelope. The filter
  // above handles failures, so the two never overlap: a thrown exception
  // never reaches this interceptor.
  app.useGlobalInterceptors(new ApiResponseInterceptor());

  const document = createOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
  });

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
