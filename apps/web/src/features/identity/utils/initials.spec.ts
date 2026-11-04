import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

/**
 * The avatar shows the initials of the display name.
 *
 * The backend has no avatar field, so the initials are the whole avatar.
 * The rules that matter are the ones about names the app actually has:
 * Vietnamese names put the given name last, and a single-word name must
 * not produce the same letter twice.
 */
describe('initialsOf', () => {
  it('takes the first and the last word', () => {
    expect(initialsOf('Dev Faculty')).toBe('DF');
  });

  it('takes the last word of a three-word name', () => {
    // A Vietnamese name is `<family> <middle> <given>` — the given name
    // is what identifies the person, so it is the one that is kept.
    expect(initialsOf('Nguyễn Văn An')).toBe('NA');
  });

  it('gives one initial for a single-word name', () => {
    expect(initialsOf('Cher')).toBe('C');
  });

  it('ignores extra whitespace', () => {
    expect(initialsOf('  Dev   Faculty  ')).toBe('DF');
  });

  it('uppercases the result', () => {
    expect(initialsOf('dev faculty')).toBe('DF');
  });

  it('returns an empty string for a name with nothing in it', () => {
    expect(initialsOf('')).toBe('');
    expect(initialsOf('   ')).toBe('');
  });

  it('does not cut a character outside the basic plane in half', () => {
    // `Array.from` counts code points, so the emoji survives as one
    // character rather than two halves.
    expect(initialsOf('😀 Faculty')).toBe('😀F');
  });
});
