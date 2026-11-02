# Data and errors

The response envelope, the query flags, and how a backend error becomes a
message on screen.

## The response envelope in one line

The frontend never unwraps it by hand — the Orval mutator
`src/lib/axios-instance.ts` unwraps one level, so `query.data` is the
**payload** type (`HealthStatusDto`), not the envelope.

```typescript
// Right — data is the payload.
<Typography>{query.data.status}</Typography>

// Wrong — the envelope was already unwrapped.
<Typography>{query.data.data.status}</Typography>
```

Errors are *not* unwrapped: a failed request rejects in axios, so
`error.response.data` is still the full error envelope. Read the message
through `apiErrorMessage(error)` from `src/lib/api-error.ts`, never
`String(error)`.

> `apiErrorMessage()` returns the raw value the server sent — which in the
> target contract is a **code**, not a sentence. Resolve it against the
> catalog before rendering. See "Error codes" below.

Full details: the `researchos-contract` skill.

## Query state cheat sheet

| Situation | Flag | Why |
| --- | --- | --- |
| Request in flight | `isFetching` | True only while a request is active |
| Enabled query, never resolved | `isPending` | True until the first data arrives |
| Disabled query, never called | `isPending` | **Stays true forever** — never bind a spinner to this |
| Last attempt succeeded | `isSuccess` | Data is available |
| Last attempt failed | `isError` | Render an error state |
| Refetching with data already present | `isRefetching` | Keep showing data, add a subtle indicator |

### The `isPending` trap

`isPending` means "no data yet". For a query with `enabled: false` it is
`true` forever, so a spinner bound to it never stops and a button disabled by
it can never be clicked.

| Flag | Meaning | Use it for |
| --- | --- | --- |
| `isFetching` | A request is in flight | Disabling a submit button, "Đang tải…" labels |
| `isPending` | No data yet | Only when the query is enabled and has never resolved |
| `isSuccess` | The last attempt succeeded | Rendering data |
| `isError` | The last attempt failed | Rendering an error state |

For a query with `enabled: false`, use `isFetching` to detect a manual
`refetch()` and `isSuccess` / `isError` to detect a completed attempt.

The feature hook should hide these behind explicit names, as
`features/health/hooks/use-api-health.ts` does with `isHealthy`, `isFetching`
and `isFailed`.

## Error codes

The backend sends **codes**, not sentences: `message` carries one code for
the whole failure, and `errors[].messages` carries one code per field
constraint. The frontend resolves both against the catalog before they reach
a user.

```typescript
import { useTranslations } from 'next-intl';
import { apiErrorCode, apiFieldErrorCodes } from '@/lib/api-error';
import { resolveErrorCode, resolveFieldErrorCodes } from '@/utils/error-messages';

const t = useTranslations('errors');

// The whole failure.
const message = resolveErrorCode(t, apiErrorCode(error), t('unknown'));

// Per field, keyed by field name.
const fieldMessages = resolveFieldErrorCodes(t, apiFieldErrorCodes(error), t('unknown'));
```

`resolveErrorCode` guards on `t.has()`, which returns `false` for a key
that is not in the catalog instead of throwing. A code with no entry
degrades to the fallback — a localized string the component owns — never
to a blank error and never to a raw `snake_case` string on screen.

> **The backend does not send codes yet.** It sends English prose in
> `message` and validator prose in `errors[].messages`, so today every
> code resolves to the fallback. That is the intended behaviour, not a bug:
> an English sentence for a Vietnamese user is worse than the component's
> own localized fallback. When the backend switches to codes, the same
> calls start resolving — no frontend change needed.

Field-level rendering:

```typescript
import { apiFieldErrorCodes } from '@/lib/api-error';
import { resolveFieldErrorCodes } from '@/utils/error-messages';
import { FieldError } from '@/components/ui/feedback';

const t = useTranslations('errors');
const fieldMessages = resolveFieldErrorCodes(t, apiFieldErrorCodes(mutation.error), t('unknown'));

{Object.entries(fieldMessages ?? {}).map(([field, message]) => (
  <FieldError key={field} id={`${field}-error`}>{message}</FieldError>
))}
```

`FieldError` renders a MUI `FormHelperText` in the error style. Pass an `id`
and reference it from the input's `aria-describedby` so a screen reader
announces the message with the field.

The backend groups by field precisely so each message can sit under its
input. Do not flatten them into one toast line.

**The wording lives in the catalog.** `errors[].messages` carries codes in
the target contract, so the constraint text is a catalog entry — one per
code, in both locales. The backend does not send codes yet, so today every
code resolves to the fallback; the code path does not change when it
switches. See the `researchos-localization` skill.
