# Error codes

The three code tiers, the domain code registry, and how to add a code.

## Error text is a code, not prose

**The error envelope's `message` carries a `snake_case` code, never an
English sentence.** The frontend resolves the code against its message
catalog and renders the user's language. Prose on the wire means an English
error for every Vietnamese user, and a backend deploy for every new
language.

```typescript
// Right — a registered code the frontend can resolve.
throw new CodedHttpException(
  domainErrorCodes.opportunities.notFound,
  HttpStatus.NOT_FOUND,
);

// Wrong — the user sees this string, in whatever language the server wrote it.
throw new NotFoundException('Không tìm thấy cơ hội');
```

| Code | Meaning |
| --- | --- |
| `server_error` | Unexpected failure |
| `validation_failed` | The request body did not pass validation |
| `not_found` | The resource does not exist |
| `forbidden` | Authenticated, but not allowed |
| `unauthorized` | Not authenticated |
| `opportunity_not_found` | Domain-specific: the opportunity does not exist |

Every code the API can emit has an entry in `apps/web/src/messages/vi.json`
**and** `messages/en.json`, under the tier it belongs to. A code is a
contract: renaming one breaks every translation that references it — add a
new code instead of repurposing an old one.

## The three tiers

| Tier | Catalog path | Owner |
| --- | --- | --- |
| Generic | `errors.codes.*` | The backend — the HTTP status set, fixed |
| Field | `errors.codes.fields.*` | The DTO's validation constraints |
| Domain | `errors.codes.domain.*` | The module, through the code registry |

All three tiers are checked by a spec (`apps/web/src/utils/error-codes.spec.ts`)
that fails the test run when a locale is missing an entry.

> **The backend sends codes.** The global exception filter puts a code in
> the envelope's `message`: an exception whose message is a code keeps it,
> and everything else falls back to the generic code for the HTTP status.
> See "The current gap" in the `researchos-localization` skill for what a
> module still has to add.

## Adding a domain code

A domain code lives in **three** places, and all three change in the same
commit. The registry is what ties them together — the frontend's catalog
check reads it, and the compiler enforces it.

| # | Where | What |
| --- | --- | --- |
| 1 | `packages/error-codes/src/domain.ts` | The module's entry in `domainErrorCodes` |
| 2 | `apps/web/src/messages/en.json` | Under `errors.codes.domain` |
| 3 | `apps/web/src/messages/vi.json` | Under `errors.codes.domain` |

**1. Register the code.** Add it to the module's entry in the registry:

```typescript
// packages/error-codes/src/domain.ts
export const domainErrorCodes = {
  opportunities: {
    notFound: 'opportunity_not_found',
  },
} as const satisfies DomainCodeMap;
```

**2. Add the wording in both locales**, under `errors.codes.domain`:

```json
{ "errors": { "codes": { "domain": {
  "opportunity_not_found": "The opportunity was not found."
} } } }
```

**3. Raise it from the service**, reading the code off the registry:

```typescript
throw new CodedHttpException(
  domainErrorCodes.opportunities.notFound,
  HttpStatus.NOT_FOUND,
);
```

### Why the registry, and not a string literal

`CodedHttpException` accepts only the codes the registry lists, so:

- **A code the backend can emit but the catalog does not have** fails the
  web app's test run, instead of degrading silently into a generic
  message at runtime.
- **A code the backend cannot emit** — a string literal passed straight to
  `CodedHttpException` — is a **compile error**, not a runtime surprise.

That is the whole point of the registry: the code on the wire and the code
the catalog is checked against are the same value, so they cannot drift.

## Validation messages are codes too

class-validator lets each decorator carry its own `message`, and that message
is what the validation pipe reports — so the message is where the code goes:

```typescript
export class CreateOpportunityDto {
  @ApiProperty({
    description: 'Human-readable headline of the opportunity, shown in listings.',
    example: 'Nghiên cứu vật liệu mới cho pinh năng lượng',
  })
  @IsString({ message: 'title_invalid' })
  @IsNotEmpty({ message: 'title_required' })
  @MaxLength(200, { message: 'title_too_long' })
  title: string;
}
```

The codes are qualified by the field they belong to, so `title_required` and
`description_required` never collide. The catalog holds the wording for each
one.

The global `ValidationPipe` runs in the `grouped` error format, so a field's
real property path survives and each message keeps the code its
class-validator decorator carried.
