import { describe, expect, it } from 'vitest';
import { searchTermError } from './search-parameters';

describe('searchTermError', () => {
  it('matches the API Unicode length limits', () => {
    expect(searchTermError('❤️')).toBe('minimum');
    expect(searchTermError('✌︎')).toBe('minimum');
    expect(searchTermError('❤️'.repeat(101))).toBeUndefined();
    expect(searchTermError('❤️'.repeat(201))).toBe('maximum');
    expect(searchTermError('😀'.repeat(200))).toBeUndefined();
    expect(searchTermError('😀'.repeat(201))).toBe('maximum');
    expect(searchTermError('a\0b')).toBe('invalid');
  });
});
