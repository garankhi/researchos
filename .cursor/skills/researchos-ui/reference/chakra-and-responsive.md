# Chakra UI v3 and responsive layout

## Theme and tokens

The Chakra system is defined in `apps/web/src/theme/theme.ts` with
`createSystem(defaultConfig, config)`. Use semantic tokens such as
`bg`, `bg.panel`, `fg`, `fg.muted`, and `border` for UI colors. Add a
semantic token or recipe to the shared system when several components need
the same treatment. Keep one-off layout values on the component.

## Responsive props

Use Chakra's mobile-first style props and its default breakpoints. For
example, `px={{ base: '3', md: '6' }}` adds padding at and above `md`.
`hideBelow="md"` and `hideFrom="md"` are useful for alternate controls.
Set `minW="0"` on flex children that must shrink and use `truncate` for
single-line labels. Limit overlay widths with a viewport-relative maximum.

```tsx
import { Flex, Heading } from '@chakra-ui/react';

<Flex gap="3" direction={{ base: 'column', md: 'row' }} minW="0">
  <Heading as="h1" size="xl">{t('title')}</Heading>
</Flex>
```

## Links

Compose the locale-aware link with Chakra's `asChild`. The resulting
element is an anchor with the correct locale prefix.

```tsx
import { Button } from '@chakra-ui/react';
import NextLink from '@/components/ui/link';

<Button asChild>
  <NextLink href="/login">{t('signInAction')}</NextLink>
</Button>
```

Use the router from `@/i18n/navigation` for programmatic navigation. When
changing locales, carry the current pathname, search parameters, and fragment.

## Light and dark mode

`next-themes` owns the stored preference and applies the active class to
`<html>`. Semantic tokens update with that class. Use `ClientOnly` when
the rendered content depends on the resolved preference and supply a
same-size fallback. The root suppresses the expected class discrepancy on
`<html>` during hydration.

`EmotionRegistry` flushes Chakra styles as App Router Suspense boundaries
stream. Keep the registry outside `AppThemeProvider`. Check a cold first
load when changing the registry or provider.

## Portals

Compose Chakra overlays with `Root`, `Trigger`, `Positioner`, and
`Content`. Use `Portal` around the positioner for header menus and
popovers. Use a popover for interactive content such as a search input.
Keep trigger and portaled positioner visibility aligned at responsive
breakpoints. Check Enter, arrow keys, Escape, and focus restoration.

## Storybook

Stories sit beside their components. The preview shares the Chakra system
and both locale catalogs. The toolbar controls the iframe's language and
color mode, which portaled content inherits. Use synthetic data and
local callbacks for authenticated states. Query the preview document body
when a play function needs to interact with a portal.

```bash
pnpm --filter web storybook
pnpm --filter web build-storybook
pnpm --filter web test:storybook
```
