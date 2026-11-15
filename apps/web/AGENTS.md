<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Chakra UI v3

- Use the shared Chakra system in `src/theme/theme.ts`. Prefer semantic tokens and mobile-first responsive props.
- Compose localized navigation with Chakra `asChild` and `src/components/ui/link.tsx`. Use the localized router for redirects.
- Keep account and language overlays keyboard accessible. Check portaled content in both themes, including the first load after changing the provider.
- Use shared form controls, translated inline errors and `FormSubmitButton`. Use the snackbar for transient confirmations and failures outside a panel or field.

## Loading UI

- Use `DelayedSkeleton` from `src/components/ui/delayed-skeleton.tsx` for new block and route skeletons. Define a named Boneyard `SkeletonResult` near the content and match the rendered layout at each relevant breakpoint.
- Use a skeleton for an initial fetch without usable data or as a Suspense fallback. Reserve its space immediately and draw the bones after 200 ms. Keep ready data visible during refetches.
- Keep available navigation and controls usable. Use one translated loading announcement per region and pass `announce={false}` for decorative bones in that region. Show the empty or error state as soon as the request settles.

## Storybook

- Put stories beside components. Use the preview toolbar for locale and color mode, and use synthetic data and callbacks for authenticated states.
- Build Storybook and run `pnpm --filter web test:storybook` when changing a story or an interaction it covers.
- Use stories for component examples and access feedback. Verify real routes for HTTP behavior.
