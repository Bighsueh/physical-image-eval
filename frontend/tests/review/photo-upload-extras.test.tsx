import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PhotoUploadField } from '../../src/components/review/PhotoUploadField';

/**
 * Drag-and-drop is the desktop half of the single upload entry — worth pinning because it is
 * easy to break silently (a missing preventDefault hands the file to the browser, which
 * navigates away from the review).
 */
const noop = () => {};
const props = {
  label: '參考照片',
  hint: '張數不限',
  photos: [],
  pending: [],
  panelIndex: 1 as number | null,
  storageFull: false,
  onOpen: noop,
  onDelete: noop,
  onCaption: noop,
  onAnnotate: noop,
  onRetry: noop,
  onDismiss: noop,
};

const dropFiles = (target: Element, files: File[]) => {
  const dataTransfer = { files } as unknown as DataTransfer;
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
};

describe('PhotoUploadField — drag and drop', () => {
  it('accepts a dropped file with its panel binding', () => {
    const onAdd = vi.fn();
    render(<PhotoUploadField {...props} panelIndex={4} onAdd={onAdd} />);
    const dropzone = screen.getByText('上傳照片').closest('label')!;
    const file = new File(['x'], 'dropped.jpg', { type: 'image/jpeg' });

    dropFiles(dropzone, [file]);
    expect(onAdd).toHaveBeenCalledWith([file], 4);
  });

  it('ignores an empty drop rather than firing an upload of nothing', () => {
    const onAdd = vi.fn();
    render(<PhotoUploadField {...props} onAdd={onAdd} />);
    dropFiles(screen.getByText('上傳照片').closest('label')!, []);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('shows a drag-over affordance and clears it on leave', () => {
    render(<PhotoUploadField {...props} onAdd={noop} />);
    const dropzone = screen.getByText('上傳照片').closest('label')!;
    fireEvent.dragOver(dropzone, { dataTransfer: { files: [] } as unknown as DataTransfer });
    expect(dropzone.className).toContain('border-primary-deep');
    fireEvent.dragLeave(dropzone);
    expect(dropzone.className).not.toContain('border-primary-deep');
  });

  it('labels the image-level field differently from a panel field', () => {
    const { rerender } = render(<PhotoUploadField {...props} onAdd={noop} />);
    expect(screen.getByText(/^參考照片/)).toBeInTheDocument();
    rerender(
      <PhotoUploadField {...props} label="整體參考照片" hint="不屬於某一格" panelIndex={null} onAdd={noop} />,
    );
    expect(screen.getByText(/^整體參考照片/)).toBeInTheDocument();
  });
});
