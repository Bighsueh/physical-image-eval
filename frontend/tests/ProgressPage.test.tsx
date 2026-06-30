import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressPage } from '../src/routes/ProgressPage';
import { renderWithProviders } from './helpers';

describe('ProgressPage (US1 landing)', () => {
  it('shows the 0／51 progress start and the reviewer name', () => {
    renderWithProviders(<ProgressPage />, {
      account: {
        id: '1',
        username: 'dr.lin',
        displayName: '林醫師',
        role: 'REVIEWER',
        mustChangePassword: false,
      },
    });
    expect(screen.getByText('我的審查進度')).toBeInTheDocument();
    expect(screen.getByText(/林醫師/)).toBeInTheDocument();
    expect(screen.getByLabelText('審查進度 0 / 51')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登出' })).toBeInTheDocument();
  });
});
