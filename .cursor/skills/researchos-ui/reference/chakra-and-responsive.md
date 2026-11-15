# Chakra UI v3 and responsive layout

## Theme and tokens

The Chakra system is defined in `apps/web/src/theme/theme.ts` with
`createSystem(defaultConfig, config)`. Use semantic tokens such as
`bg`, `bg.panel`, `fg`, `fg.muted`, and `border` for UI colors. Add a
semantic token or recipe to the shared system when several components need
the same treatment. Keep one-off layout values on the component.

Use square corners for buttons, cards, inputs, menus, overlays and loading
bones. Chakra radius tokens are zero. The header’s Add new button may use a
pill radius. Any other rounded corners require an explicit design request.
The circle in the default avatar is part of the image.

## Home research card actions

Use the same card and action layout for the signed-out example and signed-in
publications. Render Download when the card has a public PDF URL or the feed
API supplies a PDF the reader can download.

Use the same outline button with `size="xs"` and `layerStyle="researchAccess"`
for Download, View publication (View source), and Request file. Match the Add
new pill shape and padding. Enabled actions have a white background with blue
text and border. On hover, use the same blue as the background and switch the
text to white. Keep labels free of underlines, the keyboard focus ring visible,
and disabled actions muted.

Use `layerStyle="researchTextLink"` for the title link and for plain text
buttons such as Save, Follow, Recommend and Share. On hover or keyboard focus,
underline the text in its full foreground color, black in light mode. Use a
transparent background for these actions. Place Save next to Download.
Group Follow, Recommend and Share with a 3.5 px gap between adjacent buttons.

## Interactive rows and elevation

Apply `layerStyle="interactiveRow"` to full-width action rows in menus,
drawers, and similar lists. An enabled row highlights across its full width
with `#e8e8e8` in light mode and a theme-adjusted gray in dark mode. A 2 px
line sits at the leading edge, on the left in left-to-right layouts. The
line sits over the row so icons and text keep their position. The same
highlight appears on keyboard focus or when a menu marks the row as active
during arrow-key navigation. Keep the component’s focus indicator and let
disabled items retain their muted treatment. Use the account menu and
Add new drawer as examples.

Set `boxShadow="overlayPanel"` on the raised surface of a menu, popover,
drawer, or dialog. Apply elevation to the panel, with its action rows flat.
Use `bg="drawerBackdrop"` for modal drawers. The translucent light backdrop
appears approximately `#eaeaea` over white and leaves the page visible. The
dark backdrop dims the page with translucent black. Check the hover,
keyboard highlight, and shadow in both color modes.

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
