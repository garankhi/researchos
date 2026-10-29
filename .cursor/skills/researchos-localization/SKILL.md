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

The error envelope's `message` field carries a machine-readable identifier
such as `server_error` or `opportunity_not_found` — not an English
sentence. The frontend looks it up in its catalog and renders the user's
language.

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

A code is a contract. Renaming one breaks every translation that references
it — add a new code instead of repurposing an old one.

### Resolving a code on the frontend

```typescript
import { apiErrorMessage } from '@/lib/api-error';
import { useTranslations } from 'next-intl';

const t = useTranslations('errors');

function resolve(code: string | undefined, fallback: string): string {
  if (code && t.has(`codes.${code}`)) {
    return t(`codes.${code}`);
  }
  return fallback;
}

const title = resolve(apiErrorCode(error), t('title'));
```

`apiErrorCode(error)` reads the code out of the error envelope;
`apiErrorMessage(error)` is the raw value the server sent, used as the
fallback when the catalog has no entry. A missing translation degrades to
the server's text, never to a blank error.

> **Status: not implemented yet.** The backend currently sends plain
> English text in `message`, and the frontend has no `apiErrorCode`
> helper. The tables above describe the target shape. When the backend
> switch lands, add `code` handling to `src/lib/api-error.ts` and the
> `errors.codes` namespace to both catalogs.

### Validation errors

Field-level messages come through `errors[].messages`. They are strings
from the validation pipe, not codes, so they are **not** translatable yet
— a form shows the server's wording for a constraint that failed. Keep the
per-field grouping (see the `researchos-ui` skill) and treat the wording
as the fallback until validation messages become codes too.

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
