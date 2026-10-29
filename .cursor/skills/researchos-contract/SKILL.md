---
name: researchos-contract
description: Explains the ResearchOS response envelope — the wire format shared by the NestJS backend and the Orval frontend client. Covers the success and error envelope shapes, the four backend files that apply it, why the OpenAPI document is rewritten, how the frontend mutator unwraps one level, reserved field names, and the three OpenAPI transform traps. Use when a response looks wrong, when `query.data` has the wrong type, when the generated client does not match the server, when touching the envelope, the interceptor, the exception filter, the envelope transform, the axios mutator, or when the user mentions the envelope, unwrapping, `ApiResponseDto`, `ApiErrorResponseDto`, `*Envelope` types, or `src/lib/api-error.ts`.
---

# ResearchOS contract

The wire format between `apps/api` and `apps/web`. One shape for every
successful response, one shape for every failure, and exactly one place on
each side that knows about it.

This skill is the *why*. The producers and consumers have their own skills:

| Side | Skill |
| --- | --- |
| Backend — produces the envelope | `researchos-api-endpoint` |
| Frontend — consumes the envelope | `researchos-ui` |

## The two shapes

A successful response:

```json
{ "success": true, "data": { "id": "abc" }, "message": "" }
```

A failed response:

```json
{
  "success": false,
  "data": null,
  "message": "Opportunity not found",
  "statusCode": 404,
  "path": "/opportunities/abc",
  "timestamp": "2026-10-29T01:30:00.000Z",
  "errors": [{ "field": "title", "messages": ["must be a string"] }]
}
```

`errors` is present only on a validation failure. `message` is a string, or
several validation messages joined with `; `.

**Changing either shape is a breaking change for every screen.** Backend and
frontend deploy independently.

## Where the envelope lives on the backend

Four files in `apps/api/src/common/` decide the shape. Know which one you
are touching before changing anything.

| File | Role |
| --- | --- |
| `common/interceptors/api-response.interceptor.ts` | Wraps every successful response |
| `common/filters/http-exception.filter.ts` | Wraps every failure |
| `common/dto/api-response.dto.ts` | Describes the envelope for Swagger |
| `common/openapi/envelope-transform.ts` | Rewrites the OpenAPI document |

They are registered in `src/main.ts` as a global pipe, a global filter and a
global interceptor, in that order.

The interceptor and the filter never overlap: a thrown exception never
reaches the success interceptor. So the controller and the service both
return the **bare payload** and let the interceptor wrap it.

```typescript
// Right — the service returns the payload.
return toOpportunityResponse(record);

// Wrong — the envelope is applied globally.
return { success: true, data: record, message: '' };
```

## Why the OpenAPI document is rewritten

Swagger only knows the payload a controller declares. Without a transform,
the spec would describe the bare payload while the server actually sends an
envelope — and the frontend client is generated from that spec. The two
would silently disagree.

`envelope-transform.ts` wraps every `2xx` response schema in the envelope, so
`openapi.json` describes what the server really sends. It is applied in
`src/openapi.ts`, right after `SwaggerModule.createDocument`.

Three rules the transform follows, each of which has caused a real bug:

- **It is idempotent.** Running it twice does not double-wrap.
- **A primitive payload stays inline.** A `type: string` payload must not be
  promoted to its own component — that would generate `models/string.ts` with
  `export type String = string`, and `export * from './string'` in the models
  barrel shadows the global `String`. Check `openapi.json` for components
  named `String`, `Number` or `Boolean` after regenerating.
- **The error envelope's `data` is `nullable`, not `type: "null"`.** OpenAPI
  3.0 has no `null` type, and `type: "null"` makes Orval's spec validation
  fail.

## How the frontend unwraps it

Orval generates the operation with the **envelope** type as its generic
(`axiosInstance<HealthStatusDtoEnvelope>(...)`), and the mutator
`apps/web/src/lib/axios-instance.ts` unwraps one level with a conditional
type:

```typescript
export type Unwrap<T> = T extends { data: infer D } ? D : T;
```

So `query.data` is the payload type and existing screens need no change. Do
not add `.data` accesses in the frontend.

### Errors are *not* unwrapped

A failed request rejects in axios, so it never reaches the mutator's
unwrapping code. `error.response.data` is still the full error envelope.
Use the helpers in `apps/web/src/lib/api-error.ts` rather than reaching into
the axios shape by hand:

```typescript
import { apiErrorMessage, apiFieldErrors } from '@/lib/api-error';

<ErrorState title="Không tải được" message={apiErrorMessage(error)} />
```

`String(error)` is wrong — it renders
`"AxiosError: Request failed with status code 500"` instead of the message
the server actually sent.

## Reserved names

`success` and `data` are reserved for the envelope. A business DTO that
happens to have both fields would be unwrapped one level too far by the
frontend mutator's `isEnvelope` check. Prefix or rename such fields.

## Tests

The envelope pieces have their own specs, and they are the ones to extend
when you change the contract:

| Spec | Covers |
| --- | --- |
| `common/interceptors/api-response.interceptor.spec.ts` | Success wrapping, null payload, no double-wrapping |
| `common/filters/http-exception.filter.spec.ts` | Error envelope, validation grouping, no stack leak |
| `common/openapi/envelope-transform.spec.ts` | Idempotency, inline primitives, error responses |

## Checklist

- [ ] The controller returns the **bare payload** — the interceptor applies the envelope
- [ ] `@Api*Response` describes the **payload** type, not the envelope
- [ ] The error envelope's `data` stays `nullable`, not `type: "null"`
- [ ] `openapi.json` has no component named `String`/`Number`/`Boolean`
- [ ] The transform stays idempotent
- [ ] The frontend does not unwrap by hand and does not read `query.data.data`
- [ ] Error messages are read through `apiErrorMessage()`, never `String(error)`
- [ ] No business DTO uses the field names `success` or `data`

## Reference

Full JSON samples, the envelope DTOs, and the transform's edge cases:
[reference.md](reference.md).

Rules and rationale: `docs/api-convention.md` §6b,
`docs/envelope-verification.md`.
