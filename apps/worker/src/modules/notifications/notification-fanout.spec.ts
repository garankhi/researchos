import { describe, expect, it } from 'vitest';
import { resolveLocale } from './notification-fanout.js';

describe('Notification locale resolution', () => {
  it('prefers the registered device locale over the stored preference', () => {
    expect(resolveLocale({ device: 'en', preference: 'vi' })).toBe('en');
    expect(resolveLocale({ device: 'vi', preference: 'en' })).toBe('vi');
  });

  it('falls back to the preference when the recipient has no device', () => {
    // A recipient who never enabled push still receives readable copy.
    expect(resolveLocale({ preference: 'en' })).toBe('en');
    expect(resolveLocale({ preference: 'vi' })).toBe('vi');
  });

  it('falls back to Vietnamese when neither a device nor a preference exists', () => {
    expect(resolveLocale({})).toBe('vi');
    expect(resolveLocale({ device: undefined, preference: undefined })).toBe(
      'vi',
    );
  });

  it('resolves a regional English tag to the English copy', () => {
    expect(resolveLocale({ device: 'en-GB' })).toBe('en');
    expect(resolveLocale({ preference: 'EN-US' })).toBe('en');
  });

  it('resolves a regional Vietnamese tag to the Vietnamese copy', () => {
    expect(resolveLocale({ device: 'vi-VN' })).toBe('vi');
    expect(resolveLocale({ preference: 'VI' })).toBe('vi');
  });

  it('resolves an unknown locale to the Vietnamese copy', () => {
    expect(resolveLocale({ preference: 'fr' })).toBe('vi');
    expect(resolveLocale({ preference: '' })).toBe('vi');
  });
});
