import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../src/App';
import { renderWithProviders } from './helpers';

/**
 * US3 / SC-002 / FR-005 — the SPA exposes no registration route or create-account entry, and an
 * unauthenticated visit to any protected route lands on /login.
 */
const onLoginScreen = () =>
  expect(screen.getByRole('button', { name: '登入' })).toBeInTheDocument();

describe('no registration surface (US3, frontend)', () => {
  it('a /register path resolves to the login screen (no register route exists)', () => {
    renderWithProviders(<AppRoutes />, { route: '/register' });
    onLoginScreen();
  });

  it('a /signup path resolves to the login screen', () => {
    renderWithProviders(<AppRoutes />, { route: '/signup' });
    onLoginScreen();
  });

  it('an unauthenticated visit to a protected admin route redirects to /login', () => {
    renderWithProviders(<AppRoutes />, { route: '/admin/accounts' });
    onLoginScreen();
  });

  it('an unauthenticated visit to /progress redirects to /login', () => {
    renderWithProviders(<AppRoutes />, { route: '/progress' });
    onLoginScreen();
  });

  it('the login screen has no create-account / signup link or text', () => {
    renderWithProviders(<AppRoutes />, { route: '/login' });
    expect(screen.queryByText(/註冊|建立帳號|申請帳號|signup|register/i)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
