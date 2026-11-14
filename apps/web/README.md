# ResearchOS Web

The web app uses Next.js App Router, Chakra UI v3, and `next-intl` for Vietnamese and English. Follow the [repository setup](../../README.md) for the workspace and API.

```bash
pnpm --filter web dev
pnpm --filter web lint
pnpm --filter web format:check
pnpm --filter web test
pnpm --filter web build
```

Open [the local web app](http://localhost:3000). Set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` if the API uses an origin other than `http://localhost:4000`.

## Component review

```bash
pnpm --filter web exec playwright install chromium
pnpm --filter web storybook
pnpm --filter web build-storybook
pnpm --filter web test:storybook
```

Open [Storybook](http://127.0.0.1:6006) and use the toolbar to review both locales and color modes. Stories use the shared Chakra system. Check initial rendering, hydration and actual login and API behavior in the web app.

See the [UI guide](../../.cursor/skills/researchos-ui/SKILL.md) for theme, responsive layout and portals. See the [form guide](../../.cursor/skills/researchos-forms/SKILL.md) for inputs and validation.
