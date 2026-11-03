<!--
  The template for every pull request.

  Fill in the four fields below. The rest of the checklist is the gate
  that has to pass before the PR can merge — keep it honest rather than
  ticking it by default.
-->

**Ticket:** `RES-<n>`

**Flow label:** `flow: feat` | `flow: fix` | `flow: ci` | `flow: refactor` | `flow: docs` | `flow: chore`

**Base branch:** `dev`

**Verify command:** `pnpm codegen && pnpm build && pnpm lint && pnpm test`

---

## What this changes

<!-- One or two sentences. What is different after this PR? -->

## Why

<!-- The problem this solves, and why this approach. Link the ticket if it says more than the summary does. -->

## How it was verified

<!-- What you ran and what you saw. If something could not be verified, say so here. -->

---

<!--
  Checklist. Every box has to be honest — an unchecked box is fine, a
  ticked box that is not true is not.
-->
## Checklist

- [ ] The commit messages follow `feat(web): <desc> RES-<n>` — one ticket per commit
- [ ] The branch is named `feat/RES-<n>-<slug>`
- [ ] The PR targets `dev`, not `main`
- [ ] `pnpm codegen` was run, and `apps/api/openapi.json` and `apps/web/src/lib/api/` are committed
- [ ] `pnpm build`, `pnpm lint` and `pnpm test` pass locally
- [ ] No user-facing string is hardcoded — every one comes from the message catalog
- [ ] Any new error code has an entry in **both** locale catalogs, under the tier it belongs to
- [ ] Nothing sensitive is committed: no `.env`, no credentials, no tokens
