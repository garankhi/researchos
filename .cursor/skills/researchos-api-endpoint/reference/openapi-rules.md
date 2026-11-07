# OpenAPI rules

The rules the OpenAPI document is checked against, and the shared error
envelope.

## The rules are enforced by code

The prose rules in this skill are checked by code, not by a reviewer.

`apps/api/src/common/openapi/openapi-rules.ts` holds the rules, and
`apps/api/src/openapi-rules.spec.ts` builds the **real** OpenAPI document
and fails `pnpm --filter api test` when a rule is broken. The rules are:

| Rule | What it checks |
| --- | --- |
| `operation.summary` | Every route has a non-empty `@ApiOperation` summary |
| `operation.responses` | Every route declares at least one response |
| `response.description` | Every response has a description |
| `errorResponse.schema` | Every error response points at the shared error envelope |
| `parameter.description` | Every parameter — path, header, query — has a description |
| `bodyProperty.description` | Every request body property has a description |
| `schemaProperty.description` | Every DTO property has a description |
| `component.name` | No component is named `String`, `Number` or `Boolean` |
| `schema.reservedFields` | No business DTO uses both `success` and `data` |
| `paginatedResponse.itemsRef` | A paginated response's `items` reference a concrete item schema |

The `description` rules are what make the `description` on a DTO field
mandatory rather than a nice-to-have: `apps/api/src/openapi-rules.spec.ts`
builds the real OpenAPI document and fails the test run if any property of a
request or response DTO has no `description`.

The failure message names the rule, the location and the fix, so a red test
tells you exactly which decorator to add:

```text
parameter.description @ GET /profiles/{id} -> path id: The parameter "id"
has no description. Path and header parameters need an explicit @ApiParam or
@ApiHeader; query parameters inherit theirs from the DTO's @ApiProperty.
```

Run it after touching a controller or a DTO:

```powershell
pnpm --filter api exec vitest run src/openapi-rules.spec.ts
```

If you change a rule, change it in `openapi-rules.ts` **and** add a case to
`openapi-rules.spec.ts`. The rules are the contract; the prose is only their
documentation.

## Error responses describe the shared envelope

**Error responses must not declare a `type`.** The exception filter is
global: the server answers *every* failure with `ApiErrorResponseDto`, no
matter what the route says. An error response that declares its own body
type describes a body the server never sends.

```typescript
// Right — the description labels the status code. The body is the shared
// error envelope, which the OpenAPI transform attaches.
@ApiNotFoundResponse({ description: 'Không tìm thấy cơ hội' })

// Wrong — the server never sends this body.
@ApiNotFoundResponse({ description: 'Không tìm thấy', type: ErrorDto })
```

This is not a style rule. `apps/api` fails the test run if an error
response declares a schema other than the shared error envelope. The same
applies to the success responses: they describe the **payload**.

The transform goes further and **overwrites** the schema of every
`4xx`/`5xx` response, so a route-declared body cannot survive even if it
were allowed. See the `researchos-contract` skill for why.

## The envelope is not described by hand

Do not describe the envelope in the controller. Annotate the *payload* type,
exactly as you would without the envelope:

```typescript
// Right — the payload type. The envelope is added by the OpenAPI transform.
@ApiOkResponse({ description: 'Chi tiết cơ hội', type: OpportunityResponseDto })
```

Describing the envelope by hand (`type: HealthStatusDtoEnvelope`) would
double-wrap it: the transform already wraps every `2xx` response, and it
skips an already-wrapped schema, so the mistake is silent rather than loud.

## A paginated response names its item type

A paginated response is a `PaginatedResultDto` subclass whose `items` field
must declare the concrete record type:

```typescript
// Right — the generated client knows what `items` holds.
export class PaginatedUsersResponseDto extends PaginatedResultDto<UserResponseDto> {
  @ApiProperty({
    description: 'The user accounts belonging to this page.',
    type: [UserResponseDto],
  })
  declare items: UserResponseDto[];
}
```

If `items` degrades to a generic `{ type: "object" }`, Orval generates
`items: { [key: string]: unknown }[]` and every consumer has to cast. The
`paginatedResponse.itemsRef` rule fails the test run when a `Paginated*`
schema does not reference a concrete item schema.

## Swagger decorator checklist

| Decorator | When |
| --- | --- |
| `@ApiTags('domain')` | On the controller class, matches the module name |
| `@ApiOperation({ summary })` | **Every route, mandatory.** One line describing what the route does |
| `@ApiOkResponse({ description, type })` | `GET`, `PUT`, `PATCH`, `DELETE` returning `200` |
| `@ApiCreatedResponse({ description, type })` | `POST` returning `201` |
| `@ApiAcceptedResponse({ description, type })` | `POST` returning `202` for a queued job |
| `@ApiNoContentResponse({ description })` | A route with `@HttpCode(204)` |
| `@ApiNotFoundResponse({ description })` | A route that can 404 |
| `@ApiBadRequestResponse({ description })` | A route with a validated body or query |
| `@ApiUnauthorizedResponse({ description })` | A route behind a guard |
| `@ApiForbiddenResponse({ description })` | A route where a signed-in user can still be refused |
| `@ApiInternalServerErrorResponse({ description })` | A route that can fail unexpectedly |
| `@ApiParam({ name, description, example })` | Every path parameter |
| `@ApiHeader({ name, description, required, example })` | Every header parameter |
| `@ApiQuery({ name, description, required, example })` | A loose query parameter outside a DTO |
| `@ApiBearerAuth()` | A route that requires a session |

Always pass an explicit `type` on a **success** response. Without it Swagger
infers `object` and the generated client type is wrong.

**Never pass a `type` on an error response.** The server always answers a
failure with the shared error envelope, whatever the route declares.
