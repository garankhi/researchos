# ResearchOS contract — reference

Templates and lookup tables for `researchos-contract`. Read the section you
need; do not read this file end to end.

## The success envelope

```json
{
  "success": true,
  "data": { "id": "abc" },
  "message": ""
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `success` | `true` | Always literally `true` on success |
| `data` | payload | The endpoint's actual return value |
| `message` | `string` | Empty unless the endpoint sets one |

`data` may be `null` — an endpoint that returns nothing still gets an
envelope. It may also be a primitive (`string`, `number`, `boolean`), which
is why the transform must keep primitive payloads inline.

## The error envelope

```json
{
  "success": false,
  "data": null,
  "message": "Profile not found",
  "statusCode": 404,
  "path": "/profiles/abc",
  "timestamp": "2026-10-29T01:30:00.000Z"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `success` | `false` | Always literally `false` on failure |
| `data` | `null` | Always null — there is no payload on failure |
| `message` | `string` | What went wrong, in human words |
| `statusCode` | `number` | The HTTP status code |
| `path` | `string` | The path of the failed request |
| `timestamp` | `string` | ISO timestamp of the response |

### Validation failures

A validation failure adds an `errors` array, grouped by field, so the
frontend can show each message next to the input that caused it:

```json
{
  "success": false,
  "data": null,
  "message": "title must be a string; title should not be empty",
  "statusCode": 400,
  "path": "/profiles",
  "timestamp": "2026-10-29T01:30:00.000Z",
  "errors": [
    { "field": "title", "messages": ["must be a string", "should not be empty"] }
  ]
}
```

`message` is a string, or several validation messages joined with `; `.

## The envelope DTOs

`apps/api/src/common/dto/api-response.dto.ts` declares two classes.

### `ApiResponseDto<T = unknown>`

```typescript
export class ApiResponseDto<T = unknown> {
  @ApiProperty({ description: 'Always true for a successful response.', example: true })
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
```

`data` is typed `unknown` on purpose. The concrete payload type is carried
by the generated OpenAPI schema, not by this class.

### `ApiErrorResponseDto`

```typescript
export class ApiErrorResponseDto {
  @ApiProperty({ description: 'Always false for an error response.', example: false })
  success: false;

  @ApiProperty({
    description: 'Always null for an error response.',
    example: null,
    nullable: true,
    enum: [null],
  })
  data: null;

  @ApiProperty({ description: 'Human readable description of what went wrong.', example: 'Opportunity not found' })
  message: string;

  @ApiProperty({ description: 'HTTP status code of the response.', example: 404 })
  statusCode: number;

  @ApiProperty({ description: 'Path of the request that failed.', example: '/opportunities/abc' })
  path: string;

  @ApiProperty({ description: 'ISO timestamp of when the response was produced.', example: '2026-10-29T01:30:00.000Z' })
  timestamp: string;

  @ApiPropertyOptional({
    description: 'Field-level validation errors. Present when the request body or query failed validation.',
    type: 'array',
    items: { type: 'object' },
  })
  errors?: Array<{ field: string; messages: string[] }>;
}
```

Note `nullable: true, enum: [null]` rather than `type: 'null'` — OpenAPI 3.0
has no `null` type.

## Component naming in `openapi.json`

The transform derives an envelope component name from the payload schema.

| Payload schema | Component name |
| --- | --- |
| `$ref` to `HealthStatusDto` | `HealthStatusDtoEnvelope` |
| `$ref` to a name already ending in `Envelope` | unchanged |
| Inline schema, `200` response | `<OperationId>Envelope` |
| Inline schema, `201` / `202` response | `<OperationId><Status>Envelope` |

Only the primary `200` response gets the bare name; a second `2xx` response
gets the status code so the two cannot collide.

## The frontend mutator

`apps/web/src/lib/axios-instance.ts`:

```typescript
export type Unwrap<T> = T extends { data: infer D } ? D : T;

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message: string;
}

export function isEnvelope(body: unknown): body is ApiEnvelope<unknown> {
  return (
    typeof body === 'object' &&
    body !== null &&
    'success' in body &&
    'data' in body &&
    typeof (body as { success: unknown }).success === 'boolean'
  );
}

export const axiosInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<Unwrap<T>> => {
  const source = Axios.CancelToken.source();
  const promise = AXIOS_INSTANCE({ ...config, ...options, cancelToken: source.token })
    .then(({ data: body }) => {
      const payload = isEnvelope(body) ? body.data : body;
      return payload as Unwrap<T>;
    });

  promise.cancel = () => source.cancel('Query was cancelled');
  return promise;
};
```

`isEnvelope` exists so the frontend can talk to both an old (raw) and a new
(enveloped) backend during a deploy window.

`isEnvelope` checks for `success` **and** `data` — which is exactly why
`success` and `data` are reserved names for business payloads.

## The frontend error helpers

`apps/web/src/lib/api-error.ts`:

```typescript
export type ApiErrorBody = ApiErrorResponseDto;

export function apiErrorMessage(error: unknown): string;
export function apiFieldErrors(error: unknown): ApiErrorBody['errors'];
export function apiStatusCode(error: unknown): number | undefined;
```

`apiErrorMessage` reads `error.response.data.message` first, falls back to
`error.message`, then to a generic Vietnamese message. `apiFieldErrors`
returns the per-field validation messages.

`ApiErrorBody` is a type-only alias of the generated `ApiErrorResponseDto`,
imported from `@/lib/api/models`. The eslint rule allows type-only imports
from `@/lib/api/*` because a type is erased at build time and cannot pull a
deleted runtime module into the bundle.

## Where each piece lives

| Side | File | Role |
| --- | --- | --- |
| Backend | `common/interceptors/api-response.interceptor.ts` | Wraps successful responses |
| Backend | `common/filters/http-exception.filter.ts` | Wraps failures |
| Backend | `common/dto/api-response.dto.ts` | Describes the envelope for Swagger |
| Backend | `common/openapi/envelope-transform.ts` | Rewrites the OpenAPI document |
| Backend | `src/openapi.ts` | Applies the transform after `SwaggerModule.createDocument` |
| Backend | `src/main.ts` | Registers the global pipe, filter and interceptor |
| Frontend | `src/lib/axios-instance.ts` | Unwraps one level of the success envelope |
| Frontend | `src/lib/api-error.ts` | Reads the error envelope |

## Verifying the contract

```powershell
pnpm --filter api test          # the three envelope specs
pnpm --filter api openapi       # regenerate openapi.json
pnpm --filter web orval         # regenerate the client
pnpm codegen                    # both, in order
```

After regenerating, check `openapi.json` for a component named `String`,
`Number` or `Boolean` — any of those means a primitive payload was promoted
and the models barrel now shadows a global type.

## Common mistakes

| Mistake | Consequence |
| --- | --- |
| Building `{ success, data, message }` in a controller | Double-wrapped — the interceptor applies the envelope globally |
| `@ApiOkResponse({ type: SomeDtoEnvelope })` | Double-wrapped in the spec too; annotate the **payload** type |
| Reading `query.data.data` in the frontend | The mutator already unwrapped the envelope |
| `String(error)` in an error state | Shows `"AxiosError: Request failed with status code 500"` instead of the server's message |
| A business DTO with both `success` and `data` fields | Unwrapped one level too far by `isEnvelope` |
| `type: "null"` for the error envelope's `data` | Orval's spec validation fails |
| Promoting a primitive payload to a component | Generates `models/string.ts`; shadows the global `String` |
| Running the transform twice | Handled — it is idempotent, but the invariant is worth a test |
