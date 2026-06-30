import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AuthAccount } from '../src/api/auth';
import { RoleGate } from '../src/components/RoleGate';
import { renderWithProviders } from './helpers';

const admin: AuthAccount = {
  id: '1',
  username: 'admin',
  displayName: '管理員',
  role: 'ADMIN',
  mustChangePassword: false,
};
const reviewer: AuthAccount = { ...admin, id: '2', username: 'rev', role: 'REVIEWER' };

describe('RoleGate (US4 — cosmetic only)', () => {
  it('renders admin-only children for an admin', () => {
    renderWithProviders(<RoleGate role="ADMIN">帳號管理</RoleGate>, { account: admin });
    expect(screen.getByText('帳號管理')).toBeInTheDocument();
  });

  it('hides admin-only children from a reviewer', () => {
    renderWithProviders(<RoleGate role="ADMIN">帳號管理</RoleGate>, { account: reviewer });
    expect(screen.queryByText('帳號管理')).toBeNull();
  });

  it('hides admin-only children when logged out', () => {
    renderWithProviders(<RoleGate role="ADMIN">帳號管理</RoleGate>, { account: null });
    expect(screen.queryByText('帳號管理')).toBeNull();
  });
});
