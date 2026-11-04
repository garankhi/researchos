import { SetMetadata } from '@nestjs/common';

/**
 * The metadata key that marks a route as public.
 */
export const IS_PUBLIC_KEY = 'researchos:public';

/**
 * Marks a route as reachable without a session.
 *
 * The session guard is registered globally, so every route passes through
 * it. A route that is open to everyone — the health probes, the demo
 * endpoints, the login itself — says so explicitly with this decorator.
 *
 * Without it, a public route would have to opt out of a global guard,
 * which means every public route would need its own `@UseGuards` and the
 * inverse mistake would go unnoticed: a route that *should* be protected
 * but is not, because nobody remembered to add a guard.
 *
 * The exemption is deliberately narrow. A route is public only when it is
 * declared so.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
