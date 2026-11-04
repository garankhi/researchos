import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RETURN_TO,
  buildLoginHref,
  isSafeReturnTo,
  resolveReturnTo,
} from './return-to';

/**
 * The `returnTo` parameter decides where the user lands after signing in.
 *
 * The value comes from the URL, so it is attacker-controlled. Passing it
 * to a redirect without checking it is an **open redirect**: a link like
 * `/login?returnTo=https://evil.example` would carry the user  and
 * their freshly issued session cookie  off the site right after they
 * signed in.
 *
 * These tests pin the rules that make the value safe, and pin the
 * fallback: anything that is not a plain path on this site lands on the
 * home page.
 */
describe('isSafeReturnTo', () => {
  it('accepts a path on this site', () => {
    expect(isSafeReturnTo('/demo')).toBe(true);
    expect(isSafeReturnTo('/demo/slow?tab=1')).toBe(true);
  });

  it('rejects an absolute URL', () => {
    expect(isSafeReturnTo('https://evil.example')).toBe(false);
    expect(isSafeReturnTo('http://evil.example')).toBe(false);
  });

  it('rejects a protocol-relative URL', () => {
    // `//host` points at another host, not at this site.
    expect(isSafeReturnTo('//evil.example')).toBe(false);
    expect(isSafeReturnTo('//evil.example/path')).toBe(false);
  });

  it('rejects a backslash', () => {
    // Some browsers normalise `\` to `/`, which would turn `/\host`
    // into `//host`  another host.
    expect(isSafeReturnTo('/\\evil.example')).toBe(false);
    expect(isSafeReturnTo('/demo\\..\\evil')).toBe(false);
  });

  it('rejects a value that does not start with a slash', () => {
    expect(isSafeReturnTo('demo')).toBe(false);
    expect(isSafeReturnTo('evil.example')).toBe(false);
  });

  it('rejects a value that carries a control character', () => {
    // A control character can truncate the value before the checks run,
    // so the check has to look at the whole string.
    expect(isSafeReturnTo('/demo\n')).toBe(false);
    expect(isSafeReturnTo('/demo\r\nSet-Cookie: x=1')).toBe(false);
    expect(isSafeReturnTo('/demo\u0000')).toBe(false);
  });

  it('rejects an empty value', () => {
    expect(isSafeReturnTo('')).toBe(false);
  });
});

describe('resolveReturnTo', () => {
  it('reads the path out of the search parameters', () => {
    const searchParams = new URLSearchParams({ returnTo: '/demo' });

    expect(resolveReturnTo(searchParams)).toBe('/demo');
  });

  it('falls back to the home page when there is no parameter', () => {
    expect(resolveReturnTo(new URLSearchParams())).toBe(DEFAULT_RETURN_TO);
    expect(resolveReturnTo(undefined)).toBe(DEFAULT_RETURN_TO);
  });

  it('falls back to the home page for an unsafe value', () => {
    const searchParams = new URLSearchParams({
      returnTo: 'https://evil.example',
    });

    expect(resolveReturnTo(searchParams)).toBe(DEFAULT_RETURN_TO);
  });

  it('strips a locale prefix, because the router adds it back', () => {
    // The locale-aware router prepends the locale itself, so a value
    // that already carries one would end up doubled.
    expect(resolveReturnTo(new URLSearchParams({ returnTo: '/vi/demo' }))).toBe(
      '/demo',
    );
    expect(resolveReturnTo(new URLSearchParams({ returnTo: '/en/demo' }))).toBe(
      '/demo',
    );
  });

  it('maps a bare locale to the home page', () => {
    expect(resolveReturnTo(new URLSearchParams({ returnTo: '/vi' }))).toBe(
      DEFAULT_RETURN_TO,
    );
  });

  it('reads a repeated parameter once', () => {
    const searchParams = new URLSearchParams(
      'returnTo=/demo&returnTo=https://evil.example',
    );

    expect(resolveReturnTo(searchParams)).toBe('/demo');
  });
});

describe('buildLoginHref', () => {
  it('puts the current page into the link', () => {
    expect(buildLoginHref('/demo')).toBe('/login?returnTo=%2Fdemo');
  });

  it('strips the locale prefix, because the router adds it back', () => {
    // The locale-aware router prepends the locale itself, so a value
    // that already carries one would end up doubled.
    expect(buildLoginHref('/vi/demo')).toBe('/login?returnTo=%2Fdemo');
    expect(buildLoginHref('/en/demo')).toBe('/login?returnTo=%2Fdemo');
  });

  it('maps a bare locale to the home page', () => {
    expect(buildLoginHref('/vi')).toBe('/login?returnTo=%2F');
  });

  it('round-trips through resolveReturnTo', () => {
    // The two halves of the contract: the header builds the link, the
    // login screen reads it back. Whatever the header puts in, the
    // reader has to get out again.
    const cases: Array<[string, string]> = [
      ['/demo', '/demo'],
      ['/demo/slow', '/demo/slow'],
      ['/vi/demo', '/demo'],
      ['/en/demo', '/demo'],
      ['/vi', DEFAULT_RETURN_TO],
    ];

    for (const [path, expected] of cases) {
      const href = buildLoginHref(path);
      const searchParams = new URLSearchParams(
        href.slice(href.indexOf('?') + 1),
      );

      expect(resolveReturnTo(searchParams)).toBe(expected);
    }
  });
});
