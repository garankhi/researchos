import { describe, expect, it } from 'vitest';
import { doiUrl } from './doi-url';

describe('doiUrl', () => {
  it.each([
    ['10.1000/res#test', '10.1000/res%23test'],
    ['10.1000/literal%23', '10.1000/literal%2523'],
    ['10.1000/a/../b?test', '10.1000/a%2F..%2Fb%3Ftest'],
    ['10.1000/..', '10.1000%2F..'],
  ])('encodes the DOI suffix in %s', (doi, expectedPath) => {
    expect(new URL(doiUrl(doi)).pathname).toBe(`/${expectedPath}`);
  });
});
