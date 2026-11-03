import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor.js';
import { createOpenApiDocument } from './openapi.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? true,
    // The session rides an opaque cookie, so the browser has to be allowed
    // to send it cross-origin. Without this the cookie never reaches the
    // API and every request is signed out.
    credentials: true,
  });

  // The session guard reads the session cookie from `request.cookies`, so
  // the cookie header has to be parsed into it.
  app.use(cookieParser());

  // Global validation. `whitelist` strips properties that have no matching
  // DTO decorator, so a client cannot smuggle extra fields into a payload;
  // `forbidNonWhitelisted` turns that into an explicit error instead of
  // silently dropping data. `transform` lets DTOs coerce query and body
  // values into their declared types.
  //
  // `errorFormat: 'grouped'` makes the pipe report validation failures as
  // `{ field: [messages] }` instead of a flat array of sentences. The field
  // path is the property's own path (`items.0.name`), and each message is
  // the code the validator decorator carried — both survive untouched, which
  // is what the exception filter needs to build the `errors` array.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      errorFormat: 'grouped',
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
