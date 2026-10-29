import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * OpenAPI document transform that describes the response envelope.
 *
 * The runtime envelope is produced by `ApiResponseInterceptor` and
 * `HttpExceptionFilter`, but Swagger only knows about the payload schema a
 * controller declares. This transform bridges the two: it rewrites the
 * document so every response is described with the same envelope shape that
 * the server actually sends.
 *
 * That matters because the frontend client is generated from this document.
 * Without the transform, the generated types would describe the bare payload
 * and the frontend would have to unwrap the envelope by hand at every call
 * site.
 *
 * Two properties are worth knowing:
 *
 * - It is idempotent. Running it twice does not double-wrap, because an
 *   already-wrapped schema is detected and skipped.
 * - It never promotes a primitive payload to its own component. A
 *   `type: string` payload stays inline in the envelope, which avoids
 *   generating a model named `String` that would shadow the global type
 *   when the models barrel is imported with a wildcard.
 */

type JsonSchema = Record<string, any>;

/** HTTP methods that can appear as keys of a path item object. */
const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
];

/** Name of the component that describes a failed request. */
export const ERROR_ENVELOPE_SCHEMA = 'ApiErrorResponseDto';

/**
 * Applies the envelope transform to an OpenAPI document.
 *
 * Returns a new document; the input is not modified.
 */
export function applyEnvelopeTransform(document: OpenAPIObject): OpenAPIObject {
  const doc = structuredClone(document) as JsonSchema;

  doc.components ??= {};
  doc.components.schemas ??= {};
  const schemas: JsonSchema = doc.components.schemas;

  // The error envelope is described by a DTO, so it is registered with
  // Swagger as an extra model and only referenced here.
  schemas[ERROR_ENVELOPE_SCHEMA] ??= errorEnvelopeSchema();

  for (const pathItem of Object.values(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = (pathItem as JsonSchema)[method];

      if (!operation) {
        continue;
      }

      transformOperation(operation, schemas);
    }
  }

  return doc as unknown as OpenAPIObject;
}

function transformOperation(operation: JsonSchema, schemas: JsonSchema): void {
  const responses: JsonSchema = operation.responses ?? {};

  for (const [status, response] of Object.entries(responses)) {
    const responseObject = response as JsonSchema;

    if (/^2\d\d$/.test(status)) {
      wrapSuccessResponse(responseObject, operation, status, schemas);
      continue;
    }

    if (/^[45]\d\d$/.test(status)) {
      pointErrorResponseAtEnvelope(responseObject);
    }
  }
}

/**
 * Wraps a successful response schema in the success envelope.
 *
 * Responses without a body (no `application/json` schema) are left alone,
 * which keeps endpoints that return nothing typed as `void` on the frontend.
 */
function wrapSuccessResponse(
  response: JsonSchema,
  operation: JsonSchema,
  status: string,
  schemas: JsonSchema,
): void {
  const content = response.content?.['application/json'];
  const payloadSchema: JsonSchema | undefined = content?.schema;

  if (!payloadSchema) {
    return;
  }

  const envelopeName = envelopeNameFor(payloadSchema, operation, status);

  // Idempotency: an already-wrapped schema points at its own envelope.
  if (payloadSchema.$ref?.endsWith(`/${envelopeName}`)) {
    return;
  }

  schemas[envelopeName] = {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [true], default: true },
      data: payloadSchema,
      message: { type: 'string', default: '' },
    },
    required: ['success', 'data', 'message'],
  };

  content.schema = { $ref: `#/components/schemas/${envelopeName}` };
}

/**
 * Points an error response at the shared error envelope.
 *
 * A response that already declares its own schema is left alone, so an
 * endpoint can still describe a specialised error body.
 */
function pointErrorResponseAtEnvelope(response: JsonSchema): void {
  const content = response.content?.['application/json'];

  if (content?.schema) {
    return;
  }

  response.content = {
    'application/json': {
      schema: { $ref: `#/components/schemas/${ERROR_ENVELOPE_SCHEMA}` },
    },
  };
}

/**
 * Derives the component name for an envelope.
 *
 * A payload that is already a named component keeps that name, so
 * `HealthStatusDto` becomes `HealthStatusDtoEnvelope`. An inline payload
 * falls back to the operation id, which keeps the name stable and
 * descriptive without promoting the payload to its own component.
 */
function envelopeNameFor(
  payloadSchema: JsonSchema,
  operation: JsonSchema,
  status: string,
): string {
  if (payloadSchema.$ref) {
    const componentName = payloadSchema.$ref.split('/').pop() ?? 'Response';

    return componentName.endsWith('Envelope')
      ? componentName
      : `${componentName}Envelope`;
  }

  const operationName = pascalCase(operation.operationId ?? 'response');

  // Only the primary success response gets the bare name. A second 2xx
  // response (201, 202) gets the status code so the names cannot collide.
  return status === '200'
    ? `${operationName}Envelope`
    : `${operationName}${status}Envelope`;
}

/** The schema of the error envelope, matching `ApiErrorResponseDto`. */
function errorEnvelopeSchema(): JsonSchema {
  return {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [false], default: false },
      // OpenAPI 3.0 has no `null` type. `nullable` plus a single-null enum
      // is the idiomatic way to describe a field that is always null.
      data: { nullable: true, enum: [null] },
      message: { type: 'string' },
      statusCode: { type: 'number' },
      path: { type: 'string' },
      timestamp: { type: 'string' },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            messages: { type: 'array', items: { type: 'string' } },
          },
          required: ['field', 'messages'],
        },
      },
    },
    required: ['success', 'data', 'message', 'statusCode', 'path', 'timestamp'],
  };
}

/** `healthControllerCheck` becomes `HealthControllerCheck`. */
function pascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
