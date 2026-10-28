'use client';

import Link from 'next/link';

/**
 * Client wrapper around `next/link`.
 *
 * Next.js 16 rejects functions passed from a Server Component to a Client
 * Component, so `<Button component={NextLink}>` fails with "Functions cannot
 * be passed directly to Client Components". Wrapping the Link in a module
 * marked 'use client' makes it a valid component reference.
 *
 * Use this wrapper with MUI's `component` prop. Do not use `as={Link}`.
 */
export default Link;
