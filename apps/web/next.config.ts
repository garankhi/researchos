import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  experimental: {
    optimizePackageImports: ['@chakra-ui/react'],
    // Required by the `unauthorized()` and `forbidden()` helpers so they can
    // interrupt rendering and render `unauthorized.tsx` / `forbidden.tsx`.
    // Both are still experimental in Next 16.
    authInterrupts: true,
  },
};

export default withNextIntl(nextConfig);
