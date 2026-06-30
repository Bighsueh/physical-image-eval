import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../src/components/ui/ConfirmDialog';

/** Test harness: a trigger button that opens the dialog, so focus-return can be asserted. */
function Harness({ onConfirm, loading = false }: { onConfirm?: () => void; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        開啟
      </button>
      <ConfirmDialog
        open={open}
        title="刪除 1 個帳號？"
        confirmLabel="刪除 1 個帳號"
        loading={loading}
        onConfirm={() => onConfirm?.()}
        onCancel={() => setOpen(false)}
      >
        <p>確定要刪除嗎？</p>
      </ConfirmDialog>
    </>
  );
}

describe('ConfirmDialog accessibility', () => {
  it('moves focus to Cancel on open and returns focus to the trigger on close', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '開啟' });
    await userEvent.click(trigger);

    const cancel = screen.getByRole('button', { name: '取消' });
    expect(cancel).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus(); // WCAG 2.4.3
  });

  it('traps Tab within the dialog (Tab from the last control wraps to the first)', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: '開啟' }));

    const cancel = screen.getByRole('button', { name: '取消' });
    const confirm = screen.getByRole('button', { name: '刪除 1 個帳號' });
    expect(cancel).toHaveFocus();
    await userEvent.tab();
    expect(confirm).toHaveFocus();
    await userEvent.tab(); // would leave the dialog without a trap
    expect(cancel).toHaveFocus();
  });

  it('does not close on Escape while loading', async () => {
    render(<Harness loading />);
    await userEvent.click(screen.getByRole('button', { name: '開啟' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // still open during in-flight action
  });

  it('fires onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: '開啟' }));
    await userEvent.click(screen.getByRole('button', { name: '刪除 1 個帳號' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
