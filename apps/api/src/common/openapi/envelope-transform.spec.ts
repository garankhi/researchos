import { describe, expect, it } from 'vitest';
import type { OpenAPIObject } from '@nestjs/swagger';
import {
  applyEnvelopeTransform,
  ERROR_ENVELOPE_SCHEMA,
} from './envelope-transform.js';

/**
 * A minimal document that mirrors the shape NestJS produces.
 */
function documentWith(
  responses: Record<string, unknown>,
  operationId = 'healthControllerCheck',
): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 'Test', version: '1.0.0' },
    paths: {
      '/health': {
        get: {
          operationId,
          responses,
        },
      },
    },
    components: { schemas: {} },
  } as unknown as OpenAPIObject;
}

const jsonResponse = (schema: unknown) => ({
  description: 'ok',
  content: { 'application/json': { schema } },
});

describe('applyEnvelopeTransform', () => {
  it('wraps a named payload schema in an envelope', () => {
    const doc = applyEnvelopeTransform(
      documentWith({
        '200': jsonResponse({ $ref: '#/components/schemas/HealthStatusDto' }),
      }),
    );

    const schemas = doc.components.schemas as Record<string, any>;

    expect(schemas.HealthStatusDtoEnvelope).toBeDefined();
    expect(schemas.HealthStatusDtoEnvelope.properties.data).toEqual({
      $ref: '#/components/schemas/HealthStatusDto',
    });
    expect(schemas.HealthStatusDtoEnvelope.required).toEqual([
      'success',
      'data',
      'message',
    ]);
  });

  it('points the response at the envelope', () => {
    const doc = applyEnvelopeTransform(
      documentWith({
        '200': jsonResponse({ $ref: '#/components/schemas/HealthStatusDto' }),
      }),
    );

    const response = (
      doc.paths['/health'] as any
    ).get.responses['200'];

    expect(response.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/HealthStatusDtoEnvelope',
    });
  });

  it('keeps an inline primitive payload inline', () => {
    const doc = applyEnvelopeTransform(
      documentWith({
        '200': jsonResponse({ type: 'string' }),
      }),
    );

    const schemas = doc.components.schemas as Record<string, any>;

    // A primitive must not be promoted to its own component: a component
    // named `String` would shadow the global type in the frontend models
    // barrel.
    expect(schemas.String).toBeUndefined();
    expect(schemas.HealthControllerCheckEnvelope.properties.data).toEqual({
      type: 'string',
    });
  });

  it('leaves a response without a body alone', () => {
    const doc = applyEnvelopeTransform(
      documentWith({ '200': { description: 'no content' } }),
    );

    const response = (
      doc.paths['/health'] as any
    ).get.responses['200'];

    expect(response.content).toBeUndefined();
  });

  it('points an error response at the shared error envelope', () => {
    const doc = applyEnvelopeTransform(
      documentWith({
        '200': jsonResponse({ type: 'string' }),
        '500': { description: 'server error' },
      }),
    );

    const response = (
      doc.paths['/health'] as any
    ).get.responses['500'];

    expect(response.content['application/json'].schema).toEqual({
      $ref: `#/components/schemas/${ERROR_ENVELOPE_SCHEMA}`,
    });
  });

  it('registers the error envelope schema', () => {
    const doc = applyEnvelopeTransform(documentWith({}));
    const schemas = doc.components.schemas as Record<string, any>;

    expect(schemas[ERROR_ENVELOPE_SCHEMA]).toBeDefined();
    expect(schemas[ERROR_ENVELOPE_SCHEMA].required).toContain('statusCode');
  });

  it('describes the error data field as nullable, not as a null type', () => {
    const doc = applyEnvelopeTransform(documentWith({}));
    const schemas = doc.components.schemas as Record<string, any>;

    // OpenAPI 3.0 has no `null` type. A null type here makes the Orval
    // validation fail.
    expect(schemas[ERROR_ENVELOPE_SCHEMA].properties.data.type).toBeUndefined();
    expect(schemas[ERROR_ENVELOPE_SCHEMA].properties.data.nullable).toBe(true);
  });

  it('is idempotent', () => {
    const original = documentWith({
      '200': jsonResponse({ $ref: '#/components/schemas/HealthStatusDto' }),
    });

    const once = applyEnvelopeTransform(original);
    const twice = applyEnvelopeTransform(once);

    expect(twice).toEqual(once);

    const schemas = twice.components.schemas as Record<string, any>;
    const envelope = schemas.HealthStatusDtoEnvelope;

    // The data field must point at the payload, not at the envelope itself.
    expect(envelope.properties.data).toEqual({
      $ref: '#/components/schemas/HealthStatusDto',
    });
  });

  it('does not modify the input document', () => {
    const original = documentWith({
      '200': jsonResponse({ $ref: '#/components/schemas/HealthStatusDto' }),
    });

    const snapshot = JSON.stringify(original);
    applyEnvelopeTransform(original);

    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('gives a secondary success response a distinct name', () => {
    const doc = applyEnvelopeTransform(
      documentWith({
        '200': jsonResponse({ $ref: '#/components/schemas/HealthStatusDto' }),
        '202': jsonResponse({ $ref: '#/components/schemas/JobDto' }),
      }),
    );

    const schemas = doc.components.schemas as Record<string, any>;

    expect(schemas.HealthStatusDtoEnvelope).toBeDefined();
    expect(schemas.JobDtoEnvelope).toBeDefined();
  });
});
