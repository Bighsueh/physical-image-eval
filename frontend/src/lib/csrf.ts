/** Read the non-httpOnly pie_csrf cookie so the SPA can echo it in the X-CSRF-Token header (D7). */
export const CSRF_COOKIE_NAME = 'pie_csrf';

export const readCsrfToken = (cookieName: string = CSRF_COOKIE_NAME): string | null => {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};
