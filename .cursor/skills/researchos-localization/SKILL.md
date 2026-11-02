---
name: researchos-localization
description: Explains how ResearchOS is localized — the URL-prefixed locale routing (next-intl), the message catalogs under src/messages, the translation APIs for Server and Client Components, the language toggle, and the rule that backend messages arrive as codes the frontend resolves. Use when adding a screen, adding a language, adding a translated string, wiring a locale-aware link or redirect, or when the user mentions i18n, locale, translation, messages, next-intl, language switcher, or "tiếng Việt / English".
---

# ResearchOS localization

Two locales, one URL scheme, one message catalog per locale.

| | |
| --- | --- |
| Library | `next-intl` |
| Locales | `vi` (default), `en` |
| Routing | `localePrefix: 'always'` — `/vi/...`, `/en/...` |
| Catalogs | `apps/web/src/messages/{vi,en}.json` |
| Config | `apps/web/src/i18n/` |
| Proxy | `apps/web/src/proxy.ts` |

## The shape of it

```text
apps/web/src/
  i18n/
    routing.ts         # locales, default, prefix mode, locale labels
    request.ts         # which catalog to load for this request
    navigation.ts      # locale-aware Link / useRouter / usePathname
  messages/
    vi.json            # the Vietnamese catalog
    en.json            # the English catalog
  proxy.ts             # locale routing for every request
  components/ui/
    language-toggle.tsx
  app/
    [locale]/          # every route lives under the locale segment
```

Everything below `app/` that renders UI is under `app/[locale]/`. The root
`app/global-error.tsx` stays outside it, because it replaces the root layout.

## The rule that matters most

**A user-facing string never appears as a literal in a component.**

```typescript
// Wrong — a Vietnamese literal that only reads correctly in Vietnamese.
<Button>Lưu</Button>

// Right — the string lives in the catalog.
<Button>{t('save')}</Button>
```

This holds for the same reason it holds in any i18n codebase: a literal is
one language, and the app has two.

### Where the two skills meet

`researchos-ui` decides *where* a message appears — snackbar, inline error,
field error, page title. This skill decides *where the wording comes from*.
A screen never hardcodes copy just because the UI skill showed an example
that did.

The split, in one line each:

| Concern | Owner |
| --- | --- |
| Which channel a message goes through (snackbar vs. inline) | `researchos-ui` |
| The wording of that message | `researchos-localization` (this skill) |

When the UI skill shows `showSnackbar({ message: 'Đã lưu hồ sơ.' })`, it is
illustrating the *channel*. The real code uses `t('saved')`.

> **ICU gotcha:** `<` and `>` are rich-text tag delimiters in ICU, not
> literal characters. A message containing `<html>` fails to parse with
> `UNCLOSED_TAG` and breaks the build. Wrap the angle brackets in
> apostrophes: `"'<html>' class: \"{value}\""`. A single `{` or `}` that is
> not a placeholder has the same problem — escape it as `'{'`.

## Writing a string

1. Add the key to **every** catalog — `vi.json` and `en.json`. The
   catalogs must have the same shape; `next-intl` types the keys against
   one of them, so a key missing from one file fails the typecheck.
2. Reference it with `useTranslations` or `getTranslations`.

### Client Component

```typescript
'use client';

import { useTranslations } from 'next-intl';

export function SaveButton() {
  const t = useTranslations('common');

  return <Button>{t('save')}</Button>;
}
```

### Server Component

```typescript
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('common');

  return <Button>{t('save')}</Button>;
}
```

`getTranslations` is async; `useTranslations` is not.

### Namespaces

The first argument is the namespace: the top-level key of the catalog.

```typescript
const t = useTranslations('nav');        // t('products')
const t = useTranslations('errors');     // t('notFound.title')
```

A namespace is not optional in the catalog — `useTranslations('nav')` reads
the `nav` object, not the whole file.

### Values and plurals

ICU syntax, not string concatenation.

```json
{
  "home": {
    "apiResponse": "API trả về: {status} ({service})"
  },
  "cart": {
    "items": "{count, plural, =0 {Không có món nào} one {# món} other {# món}}"
  }
}
```

```typescript
t('apiResponse', { status: 'ok', service: 'researchos-api' });
t('items', { count: 3 });
```

Never build a sentence by concatenating translated fragments — the word
order changes per language, and a fragment reads wrong on its own.

## Dates and numbers

Do not call `toLocaleString()` yourself. Use the formatter, which already
knows the active locale.

```typescript
const format = useFormatter();

format.dateTime(new Date(), { dateStyle: 'short' });
format.number(1234.5, { maximumFractionDigits: 2 });
```

The shared formats are declared in `src/i18n/request.ts` and in the
`NextIntlClientProvider` in `app/[locale]/layout.tsx`. **Both places must
agree** — the first is what the server uses, the second is what the client
uses. They are duplicated on purpose: `request.ts` cannot import from
`next-intl/server`, and the provider needs the values on the client.

## Links

`next/link` does not know about the locale prefix, so a link to `/demo`
would drop the user out of their language. Use the wrapper.

```typescript
import NextLink from '@/components/ui/link';

<Button component={NextLink} href="/demo">Demo</Button>
```

`components/ui/link.tsx` re-exports the `Link` from `@/i18n/navigation`.
It exists for two reasons: it keeps the locale prefix, and it is a Client
Component, which is what makes `<Button component={NextLink}>` legal under
Next.js 16.

For programmatic navigation, use the router from `@/i18n/navigation`:

```typescript
import { useRouter, usePathname } from '@/i18n/navigation';

const router = useRouter();
const pathname = usePathname();

router.push('/demo');                        // keeps the current locale
router.push('/demo', { locale: 'en' });      // switches locale
```

`usePathname()` returns the pathname **without** the locale prefix.

## Redirects

```typescript
import { redirect } from '@/i18n/navigation';

redirect('/login');
```

The locale-aware `redirect` keeps the user in their language. `redirect`
from `next/navigation` does not.

## Adding a locale

1. Add the locale to `routing.locales` in `src/i18n/routing.ts`.
2. Add a label to `LOCALE_LABELS` — the name of the language **in that
   language**.
3. Copy `src/messages/vi.json` to `src/messages/<new>.json` and translate
   it.
4. Nothing else. The proxy, the layout's `generateStaticParams`, and the
   language toggle all read from `routing`.

The new locale is prerendered automatically — `generateStaticParams` in
`app/[locale]/layout.tsx` returns `routing.locales.map(...)`.

## Backend messages are codes

**The backend does not send prose. It sends a code, and the frontend
resolves it.**

This is the contract. It applies to **both** fields the backend uses for
error text:

| Field | Carries | Example |
| --- | --- | --- |
| `message` | One code for the whole failure | `opportunity_not_found` |
| `errors[].messages` | One code per field per constraint | `title_required` |

A code is a machine-readable identifier such as `server_error` or
`opportunity_not_found` — never an English sentence. The frontend looks it
up in its catalog and renders the user's language.

```json
// The backend sends this.
{ "success": false, "data": null, "message": "opportunity_not_found",
  "statusCode": 404, "path": "/opportunities/abc", "timestamp": "..." }
```

```json
// The catalog holds the translation.
{ "errors": { "codes": { "opportunity_not_found": "Không tìm thấy cơ hội" } } }
```

So the frontend never shows an English error to a Vietnamese user, and
adding a language does not require a backend deploy.

> **The backend sends codes.** The exception filter puts a machine-readable
> code in `message`, and the global `ValidationPipe` runs in the `grouped`
> error format, so `errors[].messages` carries one code per constraint too.
> A code with no catalog entry falls back to a localized message, so a
> catalog that has not caught up with a new code never shows a raw
> identifier. See "The current gap" below for what still needs doing.

### Why the code lives in `message`

The envelope has one free-text field, and putting the code there keeps the
wire format unchanged — no new field to add to the DTO, the OpenAPI
transform, the generated models and the filter. The code is a *contract*,
not a message: it is stable, and the wording lives in the catalog.

### The naming convention

`snake_case`, namespaced by what failed:

| Code | Meaning |
| --- | --- |
| `server_error` | Unexpected failure |
| `validation_failed` | The request body did not pass validation |
| `not_found` | The resource does not exist |
| `forbidden` | Authenticated, but not allowed |
| `unauthorized` | Not authenticated |
| `opportunity_not_found` | Domain-specific: the opportunity does not exist |

Field-level codes follow the same convention, qualified by the field they
belong to: `title_required`, `title_too_long`, `email_invalid`.

A code is a contract. Renaming one breaks every translation that references
it — add a new code instead of repurposing an old one.

### Resolving a code on the frontend

```typescript
import { useTranslations } from 'next-intl';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';

const t = useTranslations('errors');

const title = resolveErrorCode(t, apiErrorCode(error), t('unknown'));
```

`apiErrorCode(error)` reads the code out of the error envelope;
`resolveErrorCode(t, code, fallback)` looks it up under `errors.codes`.
`t.has()` returns `false` for a key that is not in the catalog — it does not
throw — so the guard is what stops `t()` from rendering a raw key. A missing
translation degrades to a localized fallback, never to a blank error and
never to a raw `snake_case` string.

The same pattern applies per field:

```typescript
import { apiFieldErrorCodes } from '@/lib/api-error';
import { resolveFieldErrorCodes } from '@/utils/error-messages';

const messages = resolveFieldErrorCodes(
  t,
  apiFieldErrorCodes(mutation.error),
  t('unknown'),
);

{Object.entries(messages ?? {}).map(([field, message]) => (
  <FieldError key={field}>{message}</FieldError>
))}
```

### The current gap

What is true today, and what has to change:

| Piece | Today | Target |
| --- | --- | --- |
| `message` on the wire | A `snake_case` code | Done |
| `errors[].messages` on the wire | A `snake_case` code per constraint | Done |
| `api-error.ts` helpers | `apiErrorMessage`, `apiErrorCode`, `apiFieldErrors`, `apiFieldErrorCodes`, `apiStatusCode` | Done |
| `utils/error-messages.ts` | `resolveErrorCode`, `resolveFieldErrorCodes` | Done |
| Catalog | `errors.codes` has the generic codes | One entry per code the API can emit — the domain codes arrive with their module |
| Frontend resolution | Wired | The same calls resolve to the catalog |

The backend side is done:

- The exception filter emits a code in `message`: a `CodedHttpException`
  carries its own domain code, and everything else falls back to the
  generic code for the HTTP status (`codeForStatus()` in
  `src/common/errors/error-codes.ts`).
- The global `ValidationPipe` runs with `errorFormat: 'grouped'`, so a
  field's real property path survives and each message keeps the code its
  class-validator decorator carried.

What still has to happen, per module:

- Each module defines the codes it can emit and adds one catalog entry per
  code, in **both** locales, in the same change that introduces the code.
  A module raises a domain code with `CodedHttpException`.

Until a module's codes are in the catalog, the frontend renders the
localized fallback: `resolveErrorCode()` degrades to a localized message
when the code has no catalog entry, never to a blank error and never to a
raw `snake_case` string.

### Validation errors

Field-level messages come through `errors[].messages`. In the target
contract each one is a **code**, resolved the same way as `message` — see
"Resolving a code on the frontend" above.

The field *label* is a UI string and is always translated. Only the
constraint wording comes from the server, and in the target contract that
wording is a code resolved against the catalog.

> **The server sends codes here.** The `FieldError` primitive renders
> whatever string it is given, so it works with either shape. Resolve the
> value through `resolveFieldErrorCodes()` when you render it, and do not
> hardcode a catalog lookup for a key that does not exist yet.

### Form validation codes

A client-side form produces the same kind of code. The zod schema's
message is the code, and it resolves through the same `errors.codes`
namespace:

```typescript
const schema = z.object({
  title: z.string().min(1, 'title_required'),
});
```

So `title_required` means the same thing whether the failure came from the
schema or from the server — one catalog entry covers both. The form
conventions are in the `researchos-forms` skill.

## The language toggle

`components/ui/language-toggle.tsx` is a `Menu` listing every locale.

- Each locale is labelled in **its own language** (`Tiếng Việt`,
  `English`), because a reader who does not read the current UI language
  still has to recognise their own.
- Switching keeps the user on the same page: the pathname is read without
  the prefix and re-applied with the new one.
- It uses `router.replace`, not `push` — a language change is a
  preference, not a step in the history, so the back button should not
  walk through it.
- The active locale is marked with a check icon.

## Server boundaries and the locale

The route-level files under `app/[locale]/` render inside the provider, so
they can translate:

- `not-found.tsx`, `unauthorized.tsx`, `forbidden.tsx` — Server
  Components, use `getTranslations`.
- `error.tsx`, `demo/error.tsx` — Client Components, use
  `useTranslations`.

`app/global-error.tsx` replaces the root layout, so the provider is gone.
It mounts its own `NextIntlClientProvider` with the default locale's
catalog. The active locale cannot be read there — the root layout that
owns the `[locale]` segment is exactly what failed.

## The proxy

`src/proxy.ts` handles locale routing for every request:

- redirects `/` to `/vi` (or the locale negotiated from the cookie and the
  `Accept-Language` header),
- redirects `/about` to `/vi/about`,
- sets the locale header the server reads,
- emits `Link` headers for the alternate locales, so search engines can
  index each language separately.

The matcher excludes `_next`, `/api` and any path with a file extension,
so the proxy does not try to localise `favicon.ico`.

`src/proxy.ts` is Next.js 16's replacement for `middleware.ts` —
`middleware` is deprecated. Do not add a `middleware.ts` file.

## Adding a screen

1. Put it under `app/[locale]/<segment>/`.
2. Never write a user-facing literal — add the key to both catalogs.
3. Use `components/ui/link` for links, and `@/i18n/navigation` for
   programmatic navigation.
4. If it needs a locale-aware redirect, use the `redirect` from
   `@/i18n/navigation`.

### Keeping the catalogs in sync

The catalogs must have the same shape. `next-intl` types the keys against
one of them, so a key missing from one file fails the typecheck — but only
if the build reaches the typecheck. A quick check that both files agree:

```powershell
node -e "const fs=require('fs');const k=(o,p='')=>Object.entries(o).flatMap(([a,b])=>b&&typeof b==='object'?k(b,p?p+'.'+a:a):[p?p+'.'+a:a]);const vi=new Set(k(JSON.parse(fs.readFileSync('apps/web/src/messages/vi.json','utf8'))));const en=new Set(k(JSON.parse(fs.readFileSync('apps/web/src/messages/en.json','utf8'))));console.log('only vi:',[...vi].filter(x=>!en.has(x)));console.log('only en:',[...en].filter(x=>!vi.has(x)))"
```

An ICU parse error (`INVALID_MESSAGE`, `UNCLOSED_TAG`) is a *build* error,
not a type error — it surfaces when the page is rendered, not when the
catalog is typechecked. Angle brackets are the usual culprit.

## Verifying

```powershell
pnpm --filter web lint
pnpm --filter web build
```

The build output is the check that matters: each locale must appear as
its own prerendered route.

```text
├   /[locale]
│ ├ ◐ /[locale]
│ ├ ○ /vi
│ └ ○ /en
```

Check in a browser too:

- `/vi` and `/en` render their own language.
- `/` redirects to `/vi`.
- The language toggle keeps you on the same page.
- Switching language does not produce a hydration mismatch in the console.

## Common mistakes

| Mistake | Consequence |
| --- | --- |
| A user-facing literal in a component | The string stays in one language forever |
| Copying an example from the `researchos-ui` skill verbatim | That skill shows the *channel*; the wording comes from this skill's catalog |
| A `<` or `>` in a message | ICU rich-text tag — the build fails with `UNCLOSED_TAG`. Wrap it: `'<html>'` |
| Looking a validation message up in the catalog | Validation messages are not codes yet; there is no key for them |
| Adding a key to only one catalog | The typecheck fails, or the other locale renders the raw key |
| `next/link` instead of `components/ui/link` | The link drops the locale prefix |
| `usePathname` from `next/navigation` | Returns the prefixed path, so the link double-prefixes |
| `redirect` from `next/navigation` | Redirects to the unprefixed path; the proxy redirects again |
| `toLocaleString()` with no locale argument | Uses the browser locale, not the app locale |
| Concatenating translated fragments | Wrong word order in every language but one |
| Showing `apiErrorMessage(error)` directly | The user sees the server's English text |
| Renaming an existing error code | Every translation referencing it breaks |
| Adding `middleware.ts` | Deprecated in Next 16; use `src/proxy.ts` |
| A `page.tsx` outside `app/[locale]/` | The route is not localized and the proxy redirects it |
| A locale added to `routing.locales` but not to `LOCALE_LABELS` | The toggle renders `undefined` |

## Reference

Message catalog layout, the full code table, and the routing options:
[reference.md](reference.md).

Conventions for the screen itself: `researchos-ui`.
