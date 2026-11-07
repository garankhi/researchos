import { describe, expect, it } from 'vitest';
import type { OpenAPIObject } from '@nestjs/swagger';
import { checkOpenApiDocument } from './openapi-rules.js';
import { ERROR_ENVELOPE_SCHEMA } from './envelope-transform.js';

/**
 * The rules are the contract, so they get their own tests.
 *
 * The end-to-end check lives in `src/openapi-rules.spec.ts`, which runs the
 * rules against the real document. These tests pin down the behaviour of
 * each rule in isolation, so a change to the rules is a deliberate one.
 */

type JsonSchema = Record<string, any>;

const ERROR_REF = `#/components/schemas/${ERROR_ENVELOPE_SCHEMA}`;

function operation(overrides: JsonSchema = {}): JsonSchema {
  return {
    summary: 'Does a thing',
    responses: {
      '200': {
        description: 'The thing',
        content: { 'application/json': { schema: { type: 'string' } } },
      },
    },
    ...overrides,
  };
}

function documentWith(
  paths: JsonSchema,
  schemas: JsonSchema = {},
): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 'Test', version: '1.0.0' },
    paths,
    components: { schemas },
  } as unknown as OpenAPIObject;
}

/** A document with one conforming route, used as the baseline. */
function cleanDocument(): OpenAPIObject {
  return documentWith(
    {
      '/profiles/{id}': {
        get: operation({
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Identifier of the profile.',
              schema: { type: 'string' },
            },
          ],
        }),
      },
    },
    {
      ProfileDto: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Identifier of the profile.' },
        },
        required: ['id'],
      },
    },
  );
}

function rulesOf(document: OpenAPIObject): string[] {
  return checkOpenApiDocument(document).map((violation) => violation.rule);
}

describe('checkOpenApiDocument', () => {
  it('accepts a conforming document', () => {
    expect(checkOpenApiDocument(cleanDocument())).toEqual([]);
  });

  describe('operation.summary', () => {
    it('rejects a route without a summary', () => {
      const doc = documentWith({
        '/profiles': { get: operation({ summary: undefined }) },
      });

      expect(rulesOf(doc)).toContain('operation.summary');
    });

    it('rejects a route with a blank summary', () => {
      const doc = documentWith({
        '/profiles': { get: operation({ summary: '   ' }) },
      });

      expect(rulesOf(doc)).toContain('operation.summary');
    });
  });

  describe('operation.responses', () => {
    it('rejects a route that declares no response', () => {
      const doc = documentWith({
        '/profiles': { get: operation({ responses: {} }) },
      });

      expect(rulesOf(doc)).toContain('operation.responses');
    });
  });

  describe('response.description', () => {
    it('rejects a response without a description', () => {
      const doc = documentWith({
        '/profiles': {
          get: operation({
            responses: { '200': { description: '' } },
          }),
        },
      });

      expect(rulesOf(doc)).toContain('response.description');
    });
  });

  describe('errorResponse.schema', () => {
    it('rejects an error response without a body', () => {
      const doc = documentWith({
        '/profiles': {
          get: operation({
            responses: {
              '200': { description: 'ok' },
              '404': { description: 'Not found' },
            },
          }),
        },
      });

      expect(rulesOf(doc)).toContain('errorResponse.schema');
    });

    it('rejects an error response that declares its own type', () => {
      const doc = documentWith({
        '/profiles': {
          get: operation({
            responses: {
              '200': { description: 'ok' },
              '404': {
                description: 'Not found',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ProfileDto' },
                  },
                },
              },
            },
          }),
        },
      });

      expect(rulesOf(doc)).toContain('errorResponse.schema');
    });

    it('accepts an error response pointing at the shared envelope', () => {
      const doc = documentWith({
        '/profiles': {
          get: operation({
            responses: {
              '200': { description: 'ok' },
              '404': {
                description: 'Not found',
                content: {
                  'application/json': { schema: { $ref: ERROR_REF } },
                },
              },
            },
          }),
        },
      });

      expect(rulesOf(doc)).not.toContain('errorResponse.schema');
    });
  });

  describe('parameter.description', () => {
    it('rejects a parameter without a description', () => {
      const doc = documentWith({
        '/profiles/{id}': {
          get: operation({
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
          }),
        },
      });

      expect(rulesOf(doc)).toContain('parameter.description');
    });
  });

  describe('bodyProperty.description', () => {
    it('rejects a request body property without a description', () => {
      const doc = documentWith(
        {
          '/profiles': {
            post: operation({
              requestBody: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CreateProfileDto' },
                  },
                },
              },
            }),
          },
        },
        {
          CreateProfileDto: {
            type: 'object',
            properties: { displayName: { type: 'string' } },
            required: ['displayName'],
          },
        },
      );

      // The property is also caught by the schema walk; either rule firing
      // is enough to fail the build.
      expect(rulesOf(doc)).toContain('bodyProperty.description');
      expect(rulesOf(doc)).toContain('schemaProperty.description');
    });
  });

  describe('schemaProperty.description', () => {
    it('rejects a schema property without a description', () => {
      const doc = documentWith(
        { '/profiles': { get: operation() } },
        {
          ProfileDto: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
      );

      expect(rulesOf(doc)).toContain('schemaProperty.description');
    });

    it('does not check the generated envelope schemas', () => {
      const doc = documentWith(
        { '/profiles': { get: operation() } },
        {
          ProfileDtoEnvelope: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['success', 'data', 'message'],
          },
        },
      );

      expect(rulesOf(doc)).not.toContain('schemaProperty.description');
    });
  });

  describe('schema.reservedFields', () => {
    it('rejects a DTO with both reserved field names', () => {
      const doc = documentWith(
        { '/profiles': { get: operation() } },
        {
          ProfileDto: {
            type: 'object',
            properties: {
              success: { type: 'boolean', description: 'ok' },
              data: { type: 'string', description: 'payload' },
            },
          },
        },
      );

      expect(rulesOf(doc)).toContain('schema.reservedFields');
    });

    it('accepts a DTO with only one reserved field name', () => {
      const doc = documentWith(
        { '/profiles': { get: operation() } },
        {
          ProfileDto: {
            type: 'object',
            properties: {
              data: { type: 'string', description: 'payload' },
            },
          },
        },
      );

      expect(rulesOf(doc)).not.toContain('schema.reservedFields');
    });
  });

  describe('component.name', () => {
    it('rejects a component named String', () => {
      const doc = documentWith(
        { '/profiles': { get: operation() } },
        { String: { type: 'string' } },
      );

      expect(rulesOf(doc)).toContain('component.name');
    });
  });

  describe('paginatedResponse.itemsRef', () => {
    it('rejects a paginated response whose items have no concrete schema', () => {
      const doc = documentWith(
        { '/profiles': { get: operation() } },
        {
          PaginatedProfilesResponseDto: {
            type: 'object',
            properties: {
              items: {
                description: 'The records of this page.',
                type: 'array',
                items: { type: 'object' },
              },
            },
          },
        },
      );

      expect(rulesOf(doc)).toContain('paginatedResponse.itemsRef');
    });

    it('accepts a paginated response whose items reference a concrete schema', () => {
      const doc = documentWith(
        { '/profiles': { get: operation() } },
        {
          PaginatedProfilesResponseDto: {
            type: 'object',
            properties: {
              items: {
                description: 'The records of this page.',
                type: 'array',
                items: { $ref: '#/components/schemas/ProfileDto' },
              },
            },
          },
          ProfileDto: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Identifier of the profile.' },
            },
          },
        },
      );

      expect(rulesOf(doc)).not.toContain('paginatedResponse.itemsRef');
    });

    it('does not check the generic base class', () => {
      const doc = documentWith(
        { '/profiles': { get: operation() } },
        {
          PaginatedResultDto: {
            type: 'object',
            properties: {
              items: {
                description: 'The records of this page.',
                type: 'array',
                items: { type: 'object' },
              },
            },
          },
        },
      );

      expect(rulesOf(doc)).not.toContain('paginatedResponse.itemsRef');
    });

    it('does not check a schema that is not a paginated response', () => {
      const doc = documentWith(
        { '/profiles': { get: operation() } },
        {
          ProfileResponseDto: {
            type: 'object',
            properties: {
              items: {
                description: 'The records of this page.',
                type: 'array',
                items: { type: 'object' },
              },
            },
          },
        },
      );

      expect(rulesOf(doc)).not.toContain('paginatedResponse.itemsRef');
    });
  });

  it('reports the location of a violation', () => {
    const doc = documentWith({
      '/profiles/{id}': {
        get: operation({
          summary: undefined,
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
        }),
      },
    });

    const violations = checkOpenApiDocument(doc);

    expect(violations).toContainEqual(
      expect.objectContaining({
        rule: 'operation.summary',
        location: 'GET /profiles/{id}',
      }),
    );
    expect(violations).toContainEqual(
      expect.objectContaining({
        rule: 'parameter.description',
        location: 'GET /profiles/{id} -> path id',
      }),
    );
  });
});
