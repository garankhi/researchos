import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { applyEnvelopeTransform } from './common/openapi/envelope-transform.js';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('ResearchOS API')
    .setDescription('ResearchOS backend API')
    .setVersion('0.0.1')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // The document is transformed so it describes the envelope the server
  // actually sends, rather than the bare payload a controller returns. The
  // frontend client is generated from this document, so this is what keeps
  // the generated types in sync with the runtime response.
  return applyEnvelopeTransform(document);
}
