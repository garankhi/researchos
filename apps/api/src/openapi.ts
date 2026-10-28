import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('ResearchOS API')
    .setDescription('ResearchOS backend API')
    .setVersion('0.0.1')
    .build();
  return SwaggerModule.createDocument(app, config);
}
