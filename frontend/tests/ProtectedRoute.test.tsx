import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { AuthAccount } from '../src/api/auth';
import { ProtectedRoute } from '../src/components/ProtectedRoute';
import { renderWithProviders } from './helpers';

const admin: AuthAccount = {
  id: '1',
  username: 'admin',
  displayName: '管理員',
  role: 'ADMIN',
  mustChangePassword: false,
};
const reviewer: AuthAccount = { ...admin, id: '2', username: 'rev', role: 'REVIEWER' };

const tree = (
  <Routes>
    <Route path="/login" element={<div>登入頁</div>} />
    <Route path="/progress" element={<div>進度頁</div>} />
    <Route element={<ProtectedRoute role="ADMIN" />}>
      <Route path="/secret" element={<div>機密管理</div>} />
    </Route>
  </Routes>
);

describe('ProtectedRoute (defense-in-depth guard)', () => {
  it('redirects to /login when unauthenticated', () => {
    renderWithProviders(tree, { route: '/secret', account: null, status: 'unauthenticated' });
    expect(screen.getByText('登入頁')).toBeInTheDocument();
  });

  it('renders nothing while the session is still resolving (unknown)', () => {
    renderWithProviders(tree, { route: '/secret', account: null, status: 'unknown' });
    expect(screen.queryByText('機密管理')).toBeNull();
    expect(screen.queryByText('登入頁')).toBeNull();
  });

  it('bounces a reviewer off an admin route to their own landing', () => {
    renderWithProviders(tree, { route: '/secret', account: reviewer });
    expect(screen.getByText('進度頁')).toBeInTheDocument();
  });

  it('renders the protected element for the matching role', () => {
    renderWithProviders(tree, { route: '/secret', account: admin });
    expect(screen.getByText('機密管理')).toBeInTheDocument();
  });
});
