# MUI and responsive layout

Component conventions, the Tailwind/MUI cascade, breakpoints, and dark mode.

Prioritize MUI components over building yourself, do not resolve to Tailwind
unless absolute neccessary.

## v9 prop surface

MUI v9 removed the system props from the direct prop surface. `gap`, `flex`,
`py`, `px`, `alignItems`, `textAlign` and `fontWeight` must go through `sx`,
or they leak onto the DOM as invalid HTML attributes.

```typescript
// Wrong — leaks to the DOM
<Stack alignItems="center" gap={2} textAlign="center">
  <Typography fontWeight={500}>Tiêu đề</Typography>
</Stack>

// Right
<Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
  <Typography sx={{ fontWeight: 500 }}>Tiêu đề</Typography>
</Stack>
```

`spacing` on `Stack` still works as a prop. `align` on `Typography` still
works as a prop. `textAlign` does not — it goes through `sx`.

### Import style

```typescript
// Preferred — tree-shakeable.
import Button from '@mui/material/Button';

// Also valid.
import { Button } from '@mui/material';
```

### Links

Next.js 16 refuses to pass a function from a Server Component to a Client
Component, so `<Button component={Link}>` fails. Use the client wrapper:

```typescript
import NextLink from '@/components/ui/link';

<Button component={NextLink} href="/profiles">Hồ sơ</Button>
```

`as={Link}` does not work — use `component`.

## Tailwind and MUI together

`globals.css` declares:

```css
@layer theme, base, mui, components, utilities;
```

`mui` sits below `utilities`, so a Tailwind utility class beats a MUI
component's own styles without `!important`. This only works while
`layout.tsx` mounts `AppRouterCacheProvider` with `enableCssLayer: true`.
Changing either one silently breaks the cascade.

```typescript
// Tailwind utility wins: `utilities` layer sits above `mui`.
<Box className="bg-amber-500 p-4" sx={{ backgroundColor: 'primary.main' }} />
```

To verify the cascade at runtime, compare computed values rather than
expecting a specific string — the browser may serialise the same colour
differently depending on how it was authored (`lab(...)` versus `rgb(...)`).

```typescript
const element = boxRef.current;
const computed = window.getComputedStyle(element).backgroundColor;
```

## Responsiveness

A component renders correctly at every width, without a JavaScript branch.
`components/ui/header.tsx` and `components/ui/search-bar.tsx` are the
reference implementations — copy their shape.

### Breakpoints

MUI's defaults, in px: `xs` 0, `sm` 600, `md` 900, `lg` 1200, `xl` 1536.
`xs` is a phone; `md` is where the inline nav and search field appear.

**Tailwind's breakpoints differ**: `sm` 640, `md` 768, `lg` 1024, `xl` 1280,
`2xl` 1536. MUI `md` is 900, Tailwind `md:` is 768 — they are not the same
line. Use one system per component; never mix `sx={{ display: { md: 'none' } }}`
with a `md:hidden` class in the same tree.

| | `xs` | `sm` | `md` | `lg` | `xl` |
| --- | --- | --- | --- | --- | --- |
| MUI (px) | 0 | 600 | 900 | 1200 | 1536 |
| Tailwind v4 (rem) | — | 640 | 768 | 1024 | 1280 |

Tailwind also has `2xl` at 1536px. MUI `md` is 900px, Tailwind `md:` is
768px — they are different lines. Pick one system per component and do not
mix `sx={{ display: { md: 'none' } }}` with a `md:hidden` class in the same
tree.

### Swap with `sx`, do not measure

```typescript
// Wrong — a JS branch renders a different tree on the server and the client.
const isDesktop = useMediaQuery('(min-width:900px)');
return isDesktop → <DesktopNav /> : <MobileNav />;

// Right — one tree, CSS decides.
<Box sx={{ display: { xs: 'none', md: 'flex' } }}>
  <DesktopNav />
</Box>
```

`useMediaQuery` is for *behaviour* differences (a different chart, a media
element), not layout. Its server value is `false`, so the server renders the
mobile branch; a branch on it renders a different tree during SSR and the
desktop tree after hydration — a mismatch. If the difference matters for
markup, gate it on mount.

Use it only when the *rendered output* differs, not the layout:

```typescript
// Fine — a media element is not a layout decision.
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
```

For layout, always use `sx` breakpoints — one tree, CSS decides.

### The collapse-to-a-menu pattern

`components/ui/header.tsx` and `components/ui/search-bar.tsx` both use it.
Four parts, always together:

1. **Trigger** — an `IconButton` shown only on small screens.
2. **Menu** — anchored to the trigger, `keepMounted`.
3. **Menu visibility** — the `Menu` itself hides on wide screens.
4. **Inline version** — hidden on small screens.

```typescript
<IconButton
  aria-label="open search"
  aria-controls="search-menu"
  aria-haspopup="true"
  onClick={handleOpen}
  color="inherit"
  sx={{ display: { xs: 'inline-flex', md: 'none' } }}
>
  <SearchIcon />
</IconButton>

<Menu
  id="search-menu"
  anchorEl={anchorEl}
  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
  keepMounted
  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
  open={open}
  onClose={handleClose}
  disableAutoFocusItem
  sx={{
    // Step 3 — without this the kept-mounted popup lingers on desktop.
    display: { xs: 'block', md: 'none' },
    mt: 1,
    p: 1,
    // Never a fixed width on a phone.
    width: 'min(92vw, 420px)',
  }}
>
  {/* The same content the inline version renders. */}
  <Search>...</Search>
</Menu>

<Search
  sx={{
    // Step 4 — the inline version, md and up.
    display: { xs: 'none', md: 'flex' },
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: { md: 380, lg: 480 },
  }}
>
  ...
</Search>
```

### Focus and dismissal

A popover that opens into an input must focus it once the popover has
rendered:

```typescript
const inputRef = React.useRef<HTMLInputElement>(null);

React.useEffect(() => {
  if (open) {
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }
}, [open]);
```

`requestAnimationFrame` because the input does not exist on the first paint
of the popover. `Escape` closes it:

```typescript
onKeyDown={(e) => {
  if (e.key === 'Escape') handleClose();
}}
```

### Never let a child overflow

A flex child that holds text needs `minWidth: 0`, or it refuses to shrink and
pushes the row wider than the viewport. Truncating labels use `noWrap` plus
`overflow: 'hidden'` and `textOverflow: 'ellipsis'`. A popover width is
`min(92vw, 420px)` — a fixed `420px` overflows a phone.

| Rule | Why |
| --- | --- |
| Flex child with text gets `minWidth: 0` | Without it the child refuses to shrink and forces a horizontal scrollbar |
| Truncated label: `noWrap` + `overflow: 'hidden'` + `textOverflow: 'ellipsis'` | Keeps one line instead of wrapping mid-word |
| Popover width `min(92vw, 420px)` | A fixed px width overflows a 375px phone |
| Icon buttons on `xs` stay ≥ 40px | Touch target size |

```typescript
<Box sx={{ flexGrow: 1, minWidth: 0 }}>
  <Typography noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
    {title}
  </Typography>
</Box>
```

## Dark mode

`components/providers/theme-provider.tsx` bridges next-themes to MUI:
next-themes owns the preference and writes the `class` on `<html>`, and the
sync calls MUI's `setMode` so both agree.

Read the theme only after mount. next-themes cannot know the resolved theme
during SSR — it depends on the client preference and the OS setting — so
reading it during render makes the server and client produce different markup
and triggers a hydration mismatch. Use `useSyncExternalStore` for
browser-only state, with a different server snapshot.

## Verifying a responsive change

Check the widths that matter, not just the build:

- 375px (phone), 768px (tablet portrait), 1024px (laptop), 1440px (desktop).
- Resize across a breakpoint while the menu is open — a kept-mounted `Menu`
  that does not hide itself flashes on the wrong side.
- Check for a horizontal scrollbar; it means a child is not allowed to shrink.
