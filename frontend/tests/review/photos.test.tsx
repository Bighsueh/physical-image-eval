import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewPhoto } from '../../src/api/review-photos';
import { PhotoUploadField } from '../../src/components/review/PhotoUploadField';
import { PendingThumb, PhotoThumb } from '../../src/components/review/PhotoThumb';
import type { PendingUpload } from '../../src/hooks/useReviewPhotos';
import { isPanelAddressed } from '../../src/state/reviewDraft';

const photo = (over: Partial<ReviewPhoto> = {}): ReviewPhoto => ({
  id: 'p1',
  panelIndex: 1,
  caption: '正確的收拳角度',
  annotated: false,
  sortOrder: 0,
  createdAt: '2026-08-27T01:48:00Z',
  urls: { display: '/d', original: '/o', annotated: null },
  ...over,
});

const pending = (over: Partial<PendingUpload> = {}): PendingUpload => ({
  key: 'up-1',
  file: new File(['x'], 'hand.jpg', { type: 'image/jpeg' }),
  panelIndex: 1,
  phase: 'uploading',
  ...over,
});

const noop = () => {};
const fieldProps = {
  label: '參考照片',
  hint: '用照片說明正確動作，張數不限。',
  panelIndex: 1 as number | null,
  storageFull: false,
  onAdd: noop,
  onOpen: noop,
  onDelete: noop,
  onCaption: noop,
  onAnnotate: noop,
  onRetry: noop,
  onDismiss: noop,
};

describe('PhotoUploadField (T113)', () => {
  it('shows a count, never a cap — there is deliberately no photo limit (FR-048)', () => {
    render(<PhotoUploadField {...fieldProps} photos={[photo(), photo({ id: 'p2' })]} pending={[]} />);
    expect(screen.getByText('已上傳 2 張')).toBeInTheDocument();
    expect(screen.queryByText(/上限|\/ 3|最多/)).not.toBeInTheDocument();
  });

  it('offers a single entry that the OS turns into 拍照／相簿／檔案 on mobile', () => {
    const { container } = render(<PhotoUploadField {...fieldProps} photos={[]} pending={[]} />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain('image/*');
    // No `capture` attribute: it would force the camera and take the photo library away.
    expect(input.hasAttribute('capture')).toBe(false);
    expect(screen.getByText('或拖曳進來')).toBeInTheDocument();
  });

  it('hands picked files to the caller with their panel binding', async () => {
    const onAdd = vi.fn();
    const { container } = render(
      <PhotoUploadField {...fieldProps} panelIndex={3} onAdd={onAdd} photos={[]} pending={[]} />,
    );
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    await userEvent.upload(input, file);
    expect(onAdd).toHaveBeenCalledWith([file], 3);
  });

  it('replaces the entry with an explained, non-colour-only notice when storage is full', () => {
    const { container } = render(
      <PhotoUploadField {...fieldProps} storageFull photos={[]} pending={[]} />,
    );
    expect(screen.getByText(/照片儲存空間已滿/)).toBeInTheDocument();
    expect(container.querySelector('input[type=file]')).toBeNull();
  });

  it('shows preparing and uploading as distinct, announced states', () => {
    const { rerender } = render(
      <PhotoUploadField {...fieldProps} photos={[]} pending={[pending({ phase: 'preparing' })]} />,
    );
    expect(screen.getByText('準備中⋯')).toBeInTheDocument();
    rerender(
      <PhotoUploadField {...fieldProps} photos={[]} pending={[pending({ phase: 'uploading' })]} />,
    );
    expect(screen.getByText('上傳中⋯')).toBeInTheDocument();
  });
});

describe('PendingThumb — failure is scoped to one file (FR-058, T113)', () => {
  it('offers retry in place and names the reason', async () => {
    const onRetry = vi.fn();
    render(
      <PendingThumb
        item={pending({ phase: 'error', message: '上傳失敗，請檢查連線後重試' })}
        onRetry={onRetry}
        onDismiss={noop}
      />,
    );
    expect(screen.getByText('上傳失敗，請檢查連線後重試')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(onRetry).toHaveBeenCalledWith('up-1');
  });

  it('hides retry when the cause is the storage ceiling — retrying cannot help', () => {
    render(
      <PendingThumb
        item={pending({ phase: 'error', storageFull: true, message: '照片儲存空間已滿，請聯絡管理員' })}
        onRetry={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: '重試' })).not.toBeInTheDocument();
  });

  it('one failure leaves its siblings alone', () => {
    render(
      <PhotoUploadField
        {...fieldProps}
        photos={[photo()]}
        pending={[
          pending({ key: 'a', phase: 'error', message: '上傳失敗' }),
          pending({ key: 'b', phase: 'uploading', file: new File(['y'], 'b.jpg') }),
        ]}
      />,
    );
    expect(screen.getByText('上傳失敗')).toBeInTheDocument();
    expect(screen.getByText('上傳中⋯')).toBeInTheDocument();
    expect(screen.getByText('已上傳 1 張')).toBeInTheDocument();
  });
});

describe('PhotoThumb (T114)', () => {
  it('marks an annotated photo with icon AND text, and shows the annotated version', () => {
    render(
      <PhotoThumb
        photo={photo({ annotated: true, urls: { display: '/d', original: '/o', annotated: '/a' } })}
        onOpen={noop}
        onDelete={noop}
        onCaption={noop}
        onAnnotate={noop}
      />,
    );
    expect(screen.getByText('已標註')).toBeInTheDocument(); // text, not colour alone
    expect(screen.getByRole('img')).toHaveAttribute('src', '/a');
  });

  it('keeps the annotate entry always visible — mobile has no hover (FR-054)', async () => {
    const onAnnotate = vi.fn();
    render(
      <PhotoThumb photo={photo()} onOpen={noop} onDelete={noop} onCaption={noop} onAnnotate={onAnnotate} />,
    );
    const button = screen.getByRole('button', { name: '標註' });
    expect(button).toBeVisible();
    await userEvent.click(button);
    expect(onAnnotate).toHaveBeenCalled();
  });

  it('saves a caption on blur, and not on every keystroke', async () => {
    const onCaption = vi.fn();
    render(
      <PhotoThumb photo={photo({ caption: null })} onOpen={noop} onDelete={noop} onCaption={onCaption} onAnnotate={noop} />,
    );
    const input = screen.getByLabelText('這張照片的說明');
    await userEvent.type(input, '側面看');
    expect(onCaption).not.toHaveBeenCalled();
    fireEvent.blur(input);
    await waitFor(() => expect(onCaption).toHaveBeenCalledWith('p1', '側面看'));
  });

  it('deletes and opens through their own controls', async () => {
    const onDelete = vi.fn();
    const onOpen = vi.fn();
    render(
      <PhotoThumb photo={photo()} onOpen={onOpen} onDelete={onDelete} onCaption={noop} onAnnotate={noop} />,
    );
    await userEvent.click(screen.getByRole('button', { name: '刪除這張參考照片' }));
    expect(onDelete).toHaveBeenCalledWith('p1');
    await userEvent.click(screen.getByRole('button', { name: /放大檢視參考照片/ }));
    expect(onOpen).toHaveBeenCalled();
  });
});

describe('client submit gate mirrors the server (T125 / FR-049)', () => {
  const blank = {
    panelIndex: 1,
    noProblem: false,
    requiredWarnings: [],
    problemTypes: [],
    warningOther: null,
    problemNote: null,
  };

  it('a photo alone addresses a panel', () => {
    expect(isPanelAddressed(blank, 0)).toBe(false);
    expect(isPanelAddressed(blank, 1)).toBe(true);
  });

  it('still holds on sign-off or annotation with no photos', () => {
    expect(isPanelAddressed({ ...blank, noProblem: true }, 0)).toBe(true);
    expect(isPanelAddressed({ ...blank, problemNote: '拇指位置' }, 0)).toBe(true);
  });
});
