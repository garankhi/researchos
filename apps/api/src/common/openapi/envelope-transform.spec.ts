import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { OpenAPIObject } from '@nestjs/swagger';
import {
  applyEnvelopeTransform,
  ERROR_ENVELOPE_SCHEMA,
} from './envelope-transform.js';
import { HttpExceptionFilter } from '../filters/http-exception.filter.js';

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

/**
 * Runs the real exception filter and returns the body it would send.
 *
 * The filter is what actually builds an error response, so its output —
 * not a hand-written copy of the shape — is what the OpenAPI schema has to
 * describe.
 */
async function captureErrorBody(
  exception: Error = new NotFoundException('Opportunity not found'),
): Promise<Record<string, unknown>> {
  const filter = new HttpExceptionFilter();

  let body: Record<string, unknown> = {};

  const response = {
    status() {
      return this;
    },
    json(payload: Record<string, unknown>) {
      body = payload;
      return this;
    },
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/opportunities/abc' }),
    }),
  } as never;

  filter.catch(exception, host);

  // The filter is synchronous; await only to keep the helper's signature
  // honest about being used with an async body.
  await Promise.resolve();

  return body;
}

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

  it('overrides an error response that declares its own body', () => {
    // The exception filter is global, so the server always answers a
    // failure with the shared envelope. A route that declares another body
    // describes something the server never sends, and the transform has to
    // correct it — silently, because the runtime does not read the spec.
    const doc = applyEnvelopeTransform(
      documentWith({
        '200': jsonResponse({ type: 'string' }),
        '404': {
          description: 'not found',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Special' } },
          },
        },
      }),
    );

    const response = (
      doc.paths['/health'] as any
    ).get.responses['404'];

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

  it('describes the error envelope the way the filter sends it', () => {
    const doc = applyEnvelopeTransform(documentWith({}));
    const schemas = doc.components.schemas as Record<string, any>;
    const errorSchema = schemas[ERROR_ENVELOPE_SCHEMA];

    // These must match `HttpExceptionFilter` exactly. The filter builds the
    // body by hand, so the transform's copy of the schema is the only place
    // the spec learns what an error looks like.
    expect(Object.keys(errorSchema.properties).sort()).toEqual([
      'data',
      'errors',
      'message',
      'path',
      'statusCode',
      'success',
      'timestamp',
    ]);

    expect(errorSchema.required).toEqual([
      'success',
      'data',
      'message',
      'statusCode',
      'path',
      'timestamp',
    ]);

    // `success` is always literally false and `data` is always null.
    expect(errorSchema.properties.success.enum).toEqual([false]);
    expect(errorSchema.properties.data.nullable).toBe(true);
    expect(errorSchema.properties.data.enum).toEqual([null]);

    // The validation grouping the filter produces.
    expect(errorSchema.properties.errors.items.required).toEqual([
      'field',
      'messages',
    ]);
  });

  it('describes the same fields the exception filter sends', async () => {
    const doc = applyEnvelopeTransform(documentWith({}));
    const schemas = doc.components.schemas as Record<string, any>;
    const described = Object.keys(schemas[ERROR_ENVELOPE_SCHEMA].properties);

    // The filter builds the error body by hand. Its actual output is the
    // source of truth, and the spec must describe the same set of fields —
    // otherwise the generated client and the runtime disagree about what a
    // failure carries.
    //
    // `errors` is the one field the filter sends only on a validation
    // failure, so it is checked separately below.
    const sent = Object.keys(await captureErrorBody());

    expect(described.sort()).toEqual([...sent, 'errors'].sort());
  });

  it('describes the validation errors the filter sends on a bad request', async () => {
    const doc = applyEnvelopeTransform(documentWith({}));
    const schemas = doc.components.schemas as Record<string, any>;
    const errorSchema = schemas[ERROR_ENVELOPE_SCHEMA];

    const body = await captureErrorBody(
      new BadRequestException({
        statusCode: 400,
        message: { title: ['title_required', 'title_invalid'] },
        error: 'Bad Request',
      }),
    );

    // The filter groups the validation messages by field, and the schema
    // has to describe that grouped shape.
    expect(body.errors).toEqual([
      { field: 'title', messages: ['title_required', 'title_invalid'] },
    ]);

    expect(errorSchema.properties.errors.type).toBe('array');
    expect(errorSchema.properties.errors.items.required).toEqual([
      'field',
      'messages',
    ]);
  });
});
