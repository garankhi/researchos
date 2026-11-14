# ResearchOS localization — reference

Lookup tables and templates for `researchos-localization`. Read the section
you need; do not read this file end to end.

## Message catalog layout

The catalogs mirror each other exactly. Same keys, same nesting, same order.

```text
apps/web/src/messages/
  vi.json
  en.json
```

### Top-level namespaces

| Namespace | Holds |
| --- | --- |
| `common` | Shared labels: `loading`, `retry`, `save`, `cancel`, `close`, `backToHome` |
| `nav` | Navigation and header items |
| `search` | Search field: `placeholder`, `label`, `open` |
| `theme` | Light/dark toggle labels |
| `language` | Language switcher labels |
| `home` | Home screen copy |
| `errors` | Error titles and descriptions, plus `codes` for backend codes |
| `notFound` | The 404 screen |
| `unauthorized` | The 401 screen |
| `forbidden` | The 403 screen |
| `storybook` | Copy for Storybook examples |

### `errors.codes` — the backend error codes

The namespace has three tiers, and each tier has one owner:

| Tier | Path | Owner |
| --- | --- | --- |
| Generic | `errors.codes.*` | The backend — the HTTP status set, fixed |
| Field | `errors.codes.fields.*` | The forms — one per field constraint |
| Domain | `errors.codes.domain.*` | Each module — one per domain code |

```json
{
  "errors": {
    "title": "Đã xảy ra lỗi khi tải trang",
    "description": "Lỗi tạm thời. Vui lòng thử lại...",
    "codes": {
      "server_error": "Máy chủ gặp sự cố. Vui lòng thử lại sau.",
      "validation_failed": "Dữ liệu gửi lên không hợp lệ.",
      "not_found": "Không tìm thấy tài nguyên.",
      "forbidden": "Bạn không có quyền truy cập tài nguyên này.",
      "unauthorized": "Bạn cần đăng nhập để tiếp tục.",
      "fields": {
        "title_required": "Tiêu đề là bắt buộc.",
        "email_invalid": "Email không hợp lệ."
      },
      "domain": {
        "opportunity_not_found": "Không tìm thấy cơ hội nghiên cứu."
      }
    }
  }
}
```

`resolveErrorCode()` looks a code up in every tier, so a caller that does
not know where a code came from still resolves it.

### Generic codes

Every backend failure has a status-derived fallback, so the frontend always
has a key to resolve. The set is **fixed** — it lives in
`packages/error-codes`, the package both sides import.

| HTTP status | Code |
| --- | --- |
| 400 | `validation_failed` |
| 401 | `unauthorized` |
| 403 | `forbidden` |
| 404 | `not_found` |
| 409 | `conflict` |
| 422 | `validation_failed` |
| 429 | `rate_limited` |
| 500 | `server_error` |
| 501 | `not_implemented` |
| 503 | `service_unavailable` |

A spec (`apps/web/src/utils/error-codes.spec.ts`) checks that every
generic code has an entry in **both** locales, so a missing one fails the
test run instead of degrading silently.

### Domain codes

One per specific failure a module can report — `opportunity_not_found`
says more than `not_found`. They live in a registry,
`packages/error-codes/src/domain.ts`, keyed by the module that owns them:

```typescript
export const domainErrorCodes = {
  opportunities: {
    notFound: 'opportunity_not_found',
  },
} as const satisfies DomainCodeMap;
```

The registry is the single source of truth: the frontend's catalog check
reads it, and the API raises the codes from it. That is what makes an
unregistered code impossible — `CodedHttpException` accepts only the
registry's codes, so a string literal is a compile error.

### Field codes

One per field constraint, qualified by the field it belongs to. Shared
between the backend's validation decorators and the frontend's zod schemas,
so `title_required` means the same thing wherever it came from.

| Code | Raised when |
| --- | --- |
| `title_required` | The title is empty |
| `title_invalid` | The title is not a string |
| `title_too_long` | The title is over 200 characters |
| `email_required` | The email is empty |
| `email_invalid` | The email is not an address |
| `status_invalid` | The status is not one of the allowed values |
| `status_required` | The status is empty |
| `email_already_registered` | The email is taken |

### Domain codes

Specific to what failed. Naming: `<noun>_<reason>`. Each module defines
its own, and adds the catalog entries in both locales in the same change.

| Code | Raised when |
| --- | --- |
| `opportunity_not_found` | The opportunity does not exist |
| `profile_not_found` | The profile does not exist |
| `profile_forbidden` | The caller may not touch this profile |
| `email_already_registered` | The email is taken |
| `file_too_large` | The upload exceeds the limit |
| `unsupported_file_type` | The upload type is not allowed |

## Backend error codes

> **Status: the backend sends codes.** The exception filter puts a code in
> `message`, and the global `ValidationPipe` runs in the `grouped` error
> format, so `errors[].messages` carries one code per constraint. A code
> with no catalog entry resolves to a localized fallback rather than to a
> raw identifier.
>
> The **domain** codes below are not implemented yet: each module defines
> the codes it can emit and adds the catalog entries in the same change.

The backend sends the code in the error envelope's `message` field.

```json
{
  "success": false,
  "data": null,
  "message": "opportunity_not_found",
  "statusCode": 404,
  "path": "/opportunities/abc",
  "timestamp": "2026-10-29T01:30:00.000Z"
}
```

### Field-level validation codes

`errors[].messages` carries codes too, one per constraint, qualified by the
field:

```json
{
  "success": false,
  "data": null,
  "message": "validation_failed",
  "statusCode": 400,
  "path": "/profiles",
  "timestamp": "2026-10-29T01:30:00.000Z",
  "errors": [{ "field": "title", "messages": ["title_invalid", "title_required"] }]
}
```

The backend produces these by putting the code in each class-validator
decorator's `message` option:

```typescript
@IsString({ message: 'title_invalid' })
@IsNotEmpty({ message: 'title_required' })
title: string;
```

The frontend resolves each code the same way as `message`, so the wording
for "title is required" lives in the catalog, not in the DTO.

### Naming rules

- `snake_case`, lowercase.
- Namespaced by what failed, not by what to do: `opportunity_not_found`,
  not `show_404`.
- Field-level codes are qualified by their field: `title_required`,
  `email_invalid`.
- Never the HTTP status as the whole code: `not_found` alone is too vague
  to be useful in a UI.
- Stable. A code is a contract between the backend and every translation
  that references it.

### Adding a code

**A domain code** touches three places, and all three change together:

1. `packages/error-codes/src/domain.ts` — register it under the module's
   own key:

   ```typescript
   export const domainErrorCodes = {
     opportunities: {
       notFound: 'opportunity_not_found',
     },
   } as const satisfies DomainCodeMap;
   ```

2. `src/messages/vi.json` — add it under `errors.codes.domain`.
3. `src/messages/en.json` — the same key.
4. Backend — raise it by reading the code off the registry:

   ```typescript
   throw new CodedHttpException(
     domainErrorCodes.opportunities.notFound,
     HttpStatus.NOT_FOUND,
   );
   ```

5. Frontend — nothing. The lookup is by key.

A **generic** code needs no catalog edit: the backend owns that set, and
`error-codes.spec.ts` checks both locales have every entry.

A **domain** code is checked by that spec too — the registry is the list
it compares against. A registered code with no entry in either locale
fails the test run, and a code that is not registered cannot be raised
at all: `CodedHttpException` accepts only the registry's codes, so
passing a string literal is a compile error.

## Translation templates

### Client Component

```typescript
'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@chakra-ui/react';

export function SaveButton({ saving }: { saving: boolean }) {
  const t = useTranslations('common');

  return <Button loading={saving}>{t('save')}</Button>;
}
```

### Server Component

```typescript
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('notFound');

  return <h1>{t('title')}</h1>;
}
```

### Server Component with a namespace and values

```typescript
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('home');

  return <p>{t('apiResponse', { status: 'ok', service: 'researchos-api' })}</p>;
}
```

### Dynamic namespace

```typescript
const t = useTranslations(namespace);
```

### A conditional message

```typescript
const t = useTranslations('common');

return <Button>{isPending ? t('loading') : t('save')}</Button>;
```

### Plural

```json
{ "cart": { "items": "{count, plural, =0 {Không có món nào} one {# món} other {# món}}" } }
```

```typescript
t('cart.items', { count: items.length });
```

### Rich text

```json
{ "terms": { "body": "Read the <link>terms</link> before continuing." } }
```

```typescript
t.rich('terms.body', {
  link: (chunks) => <Link href="/terms">{chunks}</Link>,
});
```

### Resolving a backend error code

`apiErrorCode()` and `resolveErrorCode()` live in `src/lib/api-error.ts` and
`src/utils/error-messages.ts`.

```typescript
'use client';

import { useTranslations } from 'next-intl';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';

export function useApiError() {
  const t = useTranslations('errors');

  function resolve(error: unknown): { title: string; message: string } {
    // The catalog holds the wording. The server's value is only a fallback.
    const message = resolveErrorCode(t, apiErrorCode(error), t('unknown'));

    return { title: t('title'), message };
  }

  return { resolve };
}
```

A code with no catalog entry falls back to `t('unknown')` — a localized
string — rather than to the server's raw value. In development the gap is
logged, so a missing entry is visible instead of silently degrading to a
wrong-but-plausible message.

### Dates and numbers

```typescript
const format = useFormatter();

format.dateTime(date, { dateStyle: 'short' });    // 29/10/2026
format.number(1234.5);                            // 1.234,5
format.relativeTime(date);                        // 2 giờ trước
```

Named formats, declared in `src/i18n/request.ts` and mirrored in the
provider in `app/[locale]/layout.tsx`:

```json
{
  "formats": {
    "dateTime": {
      "short": { "dateStyle": "short" },
      "long": { "dateStyle": "long" }
    },
    "number": {
      "precise": { "maximumFractionDigits": 4 }
    }
  }
}
```

```typescript
format.dateTime(date, 'short');
format.number(value, 'precise');
```

## Routing configuration

```typescript
// src/i18n/routing.ts
export const routing = defineRouting({
  locales: ['vi', 'en'],
  defaultLocale: 'vi',
  localePrefix: 'always',
});
```

| Option | Value | Why |
| --- | --- | --- |
| `locales` | `['vi', 'en']` | The supported languages |
| `defaultLocale` | `'vi'` | Used when nothing matches |
| `localePrefix` | `'always'` | Every URL carries its locale |
| `localeDetection` | default (`true`) | Uses the cookie, then `Accept-Language` |
| `alternateLinks` | default (`true`) | Emits `Link` headers for the other locales |

### Prefix modes

| Mode | URLs | Note |
| --- | --- | --- |
| `always` | `/vi/login`, `/en/login` | What ResearchOS uses |
| `as-needed` | `/login`, `/en/login` | The default locale is unprefixed — two URLs reach one page |
| `never` | `/login` | The locale comes from a cookie only; not shareable |

`always` is chosen because every page is then addressable in both
languages and a shared link carries its language.

## Locale labels

```typescript
export const LOCALE_LABELS: Record<Locale, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
};
```

Each label is the language's name **in that language**. A reader who does
not read the current UI language still has to recognise their own.

## Navigation helpers

```typescript
// src/i18n/navigation.ts
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

| Helper | Locale-aware | Notes |
| --- | --- | --- |
| `Link` | ✅ | Keeps the prefix in the href |
| `useRouter` | ✅ | `push` / `replace` keep the locale; pass `{ locale }` to switch |
| `usePathname` | ✅ | Returns the path **without** the prefix |
| `redirect` | ✅ | Redirects within the current locale |
| `getPathname` | ✅ | Builds a pathname for a locale, on the server |

### Switching locale

```typescript
const router = useRouter();
const pathname = usePathname();

router.replace(pathname, { locale: 'en' });
```

`usePathname()` returns `/login`, and the router writes `/en/login`.

### Preserving the query string

```typescript
router.replace({ pathname, query: { tab: 'api' } }, { locale: 'en' });
```

## The proxy

```typescript
// src/proxy.ts
import createProxy from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createProxy(routing);

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
```

| Matcher exclusion | Why |
| --- | --- |
| `api` | The backend has its own routes; it is not localized |
| `_next` | Build output |
| `_vercel` | Platform internals |
| `.*\..*` | Static assets — `favicon.ico`, `robots.txt` |

### What it does

| Request | Response |
| --- | --- |
| `/` | Redirect to `/vi` (or the negotiated locale) |
| `/login` | Redirect to `/vi/login` |
| `/vi/login` | Pass through, with the locale header set |
| `/en/login` | Pass through, with the locale header set |

It also emits a `Link` header listing the alternate locales, so search
engines can index each language separately.

## The layout

```typescript
// app/[locale]/layout.tsx
export default async function RootLayout({ children }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages} formats={formats}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
```

`generateStaticParams` is **required** under `cacheComponents: true` — a
root parameter needs at least one value or the build cannot resolve the
route.

The `formats` object is duplicated between `src/i18n/request.ts` and the
provider. It has to be: `request.ts` cannot import from
`next-intl/server`, and the provider needs the values on the client. Keep
them in sync.

## The language toggle

```typescript
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALE_LABELS, routing } from '@/i18n/routing';

export function LanguageToggle() {
  const t = useTranslations('language');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isPending, startTransition] = useTransition();

  function select(target: Locale) {
    setAnchorEl(null);
    if (target === locale) return;

    startTransition(() => {
      router.replace(pathname, { locale: target });
    });
  }

  return (
    <>
      <Button onClick={(e) => setAnchorEl(e.currentTarget)}>{LOCALE_LABELS[locale]}</Button>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} keepMounted>
        {routing.locales.map((option) => (
          <MenuItem key={option} selected={option === locale} onClick={() => select(option)}>
            {LOCALE_LABELS[option]}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
```

Design decisions:

- **`replace`, not `push`** — a language change is a preference, not a
  step in history.
- **`startTransition`** — the current page stays on screen while the new
  locale renders.
- **Own-language labels** — see `LOCALE_LABELS`.
- **Check icon on the active locale** — the current language is marked,
  not just implied by the trigger.

## Route boundaries

| File | Component type | Translation API |
| --- | --- | --- |
| `app/[locale]/not-found.tsx` | Server | `getTranslations` |
| `app/[locale]/unauthorized.tsx` | Server | `getTranslations` |
| `app/[locale]/forbidden.tsx` | Server | `getTranslations` |
| `app/[locale]/error.tsx` | Client | `useTranslations` |
| `app/global-error.tsx` | Client | Own `NextIntlClientProvider` |

`global-error.tsx` replaces the root layout, so the provider that normally
supplies the messages is gone. It mounts its own provider with the default
locale's catalog — the active locale cannot be read there, because the
root layout that owns the `[locale]` segment is exactly what failed.

## Commands

```powershell
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web dev
```

The build output is the check that matters — each locale must appear as
its own prerendered route:

```text
├   /[locale]
│ ├ ◐ /[locale]
│ ├ ○ /vi
│ └ ○ /en
```

## Adding a language — checklist

- [ ] The locale is in `routing.locales`
- [ ] `LOCALE_LABELS` has the name in that language
- [ ] `src/messages/<locale>.json` exists and has the same keys as `vi.json`
- [ ] The build shows the new locale as a prerendered route
- [ ] The language toggle lists it
