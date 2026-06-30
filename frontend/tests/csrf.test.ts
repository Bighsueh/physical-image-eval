import { afterEach, describe, expect, it } from 'vitest';
import { readCsrfToken } from '../src/lib/csrf';

describe('readCsrfToken (D7)', () => {
  afterEach(() => {
    document.cookie = 'pie_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('returns null when the cookie is absent', () => {
    expect(readCsrfToken('definitely_absent_cookie')).toBeNull();
  });

  it('returns the decoded value when the cookie is present', () => {
    document.cookie = 'pie_csrf=abc-123_XYZ';
    expect(readCsrfToken()).toBe('abc-123_XYZ');
  });
});
