import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AlertDialog } from '../../src/components/ui/AlertDialog';

/**
 * FR-062 — when a submit is refused, the reason must be impossible to miss.
 *
 * The inline warning stays where it is; this modal is what makes someone notice it. Reviewers
 * were pressing 提交 and seeing nothing happen.
 */
describe('AlertDialog', () => {
  const setup = (over: Partial<Parameters<typeof AlertDialog>[0]> = {}) => {
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    render(
      <AlertDialog
        open
        title="還不能提交"
        actionLabel="前往圖 2"
        onAction={onAction}
        onDismiss={onDismiss}
        {...over}
      >
        <p>還有 圖 2、圖 4 尚未處理。</p>
      </AlertDialog>,
    );
    return { onDismiss, onAction };
  };

  it('announces itself as an interruption, not a passive dialog', () => {
    setup();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('還不能提交')).toBeInTheDocument();
    expect(within(dialog).getByText(/圖 2、圖 4 尚未處理/)).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(
      <AlertDialog open={false} title="x" onDismiss={vi.fn()}>
        <p>y</p>
      </AlertDialog>,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('focuses the way OUT of the problem so Enter does the useful thing', async () => {
    setup();
    await waitFor(() => expect(screen.getByRole('button', { name: '前往圖 2' })).toHaveFocus());
  });

  it('closes on Escape, on the dismiss button, and on the backdrop', async () => {
    const { onDismiss } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '知道了' }));
    expect(onDismiss).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole('alertdialog'));
    expect(onDismiss).toHaveBeenCalledTimes(3);
  });

  it('does not close when the panel itself is clicked', async () => {
    const { onDismiss } = setup();
    await userEvent.click(screen.getByText(/圖 2、圖 4 尚未處理/));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('keeps Tab inside the dialog', async () => {
    setup();
    const dismiss = screen.getByRole('button', { name: '知道了' });
    const action = screen.getByRole('button', { name: '前往圖 2' });
    await waitFor(() => expect(action).toHaveFocus());
    await userEvent.tab();
    expect(dismiss).toHaveFocus();
    await userEvent.tab();
    expect(action).toHaveFocus();
  });

  it('works as a plain acknowledgement when there is no action to offer', () => {
    setup({ actionLabel: undefined, onAction: undefined });
    expect(screen.queryByRole('button', { name: /前往/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '知道了' })).toBeInTheDocument();
  });

  it('returns focus to the trigger when it closes (WCAG 2.4.3)', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = '提交';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const { unmount } = render(
      <AlertDialog open title="還不能提交" onDismiss={vi.fn()}>
        <p>原因</p>
      </AlertDialog>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '知道了' })).toHaveFocus());

    unmount();
    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });

  it('locks page scroll while open and releases it on close', () => {
    const { unmount } = render(
      <AlertDialog open title="還不能提交" onDismiss={vi.fn()}>
        <p>原因</p>
      </AlertDialog>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
