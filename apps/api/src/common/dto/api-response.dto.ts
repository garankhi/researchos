import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The response envelope every successful API response is wrapped in.
 *
 * The shape is stable across the whole API, which lets the frontend client
 * treat every response uniformly: unwrap `data`, read `message` when the
 * caller needs it.
 *
 * `data` is typed as `unknown` on purpose. The concrete payload type is
 * carried by the generated OpenAPI schema, not by this class — see
 * `apps/api/src/common/openapi/envelope-transform.ts`, which is what
 * produces the `*Envelope` components in `openapi.json`.
 */
export class ApiResponseDto<T = unknown> {
  @ApiProperty({
    description: 'Always true for a successful response.',
    example: true,
  })
  success: true;

  @ApiProperty({
    description: 'The payload of the response.',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'object' } },
      { type: 'object' },
      { type: 'null' },
    ],
  })
  data: T;

  @ApiProperty({
    description: 'Human readable message. Empty on success unless the endpoint sets one.',
    example: '',
  })
  message: string;
}

/**
 * The response envelope for a failed request.
 *
 * Unlike the success envelope, `data` is always `null`: there is no payload
 * when the request failed. The diagnostic fields are what a frontend shows
 * to the user, so they are kept at the top level of the envelope rather than
 * nested inside `message`.
 */
export class ApiErrorResponseDto {
  @ApiProperty({
    description: 'Always false for an error response.',
    example: false,
  })
  success: false;

  @ApiProperty({
    description: 'Always null for an error response.',
    example: null,
    nullable: true,
    enum: [null],
  })
  data: null;

  @ApiProperty({
    description: 'Human readable description of what went wrong.',
    example: 'Opportunity not found',
  })
  message: string;

  @ApiProperty({
    description: 'HTTP status code of the response.',
    example: 404,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Path of the request that failed.',
    example: '/opportunities/abc',
  })
  path: string;

  @ApiProperty({
    description: 'ISO timestamp of when the response was produced.',
    example: '2026-10-29T01:30:00.000Z',
  })
  timestamp: string;

  @ApiPropertyOptional({
    description:
      'Field-level validation errors. Present when the request body or query failed validation.',
    type: 'array',
    items: { type: 'object' },
  })
  errors?: Array<{ field: string; messages: string[] }>;
}
