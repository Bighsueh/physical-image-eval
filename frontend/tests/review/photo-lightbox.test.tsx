import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewPhoto } from '../../src/api/review-photos';
import { PhotoCompareLightbox } from '../../src/components/review/PhotoCompareLightbox';

const photo = (over: Partial<ReviewPhoto> = {}): ReviewPhoto => ({
  id: 'p1',
  panelIndex: 1,
  caption: '正確的收拳角度',
  annotated: false,
  sortOrder: 0,
  createdAt: '2026-08-27T00:00:00Z',
  urls: { display: '/display.jpg', original: '/original.jpg', annotated: null },
  ...over,
});

const setup = (photos: ReviewPhoto[], index = 0) => {
  const onClose = vi.fn();
  const onIndexChange = vi.fn();
  render(
    <PhotoCompareLightbox
      photos={photos}
      index={index}
      blueprintImageUrl="/blueprint.png"
      panelLabel="E3 · 媽媽手運動"
      onClose={onClose}
      onIndexChange={onIndexChange}
    />,
  );
  return { onClose, onIndexChange };
};

describe('PhotoCompareLightbox — original beside photo (D1–D4)', () => {
  it('shows the blueprint and the photo side by side, with position in the set', () => {
    setup([photo(), photo({ id: 'p2' })]);
    expect(screen.getByRole('img', { name: '受審圖' })).toHaveAttribute('src', '/blueprint.png');
    expect(screen.getByRole('img', { name: '正確的收拳角度' })).toHaveAttribute('src', '/display.jpg');
    expect(screen.getByText('參考照片 1 / 2')).toBeInTheDocument();
    expect(screen.getByText('E3 · 媽媽手運動')).toBeInTheDocument();
  });

  it('prefers the annotated version and lets the reviewer flip back to the untouched original', async () => {
    setup([photo({ annotated: true, urls: { display: '/d.jpg', original: '/o.jpg', annotated: '/a.jpg' } })]);
    const img = screen.getByRole('img', { name: '正確的收拳角度' });
    expect(img).toHaveAttribute('src', '/a.jpg');

    // This is how you check an arrow is not covering the detail it points at.
    await userEvent.click(screen.getByRole('button', { name: '看原圖' }));
    expect(screen.getByRole('img', { name: '正確的收拳角度' })).toHaveAttribute('src', '/o.jpg');
    await userEvent.click(screen.getByRole('button', { name: '看標註版' }));
    expect(screen.getByRole('img', { name: '正確的收拳角度' })).toHaveAttribute('src', '/a.jpg');
  });

  it('offers no原圖 toggle when there is nothing to compare against', () => {
    setup([photo()]);
    expect(screen.queryByRole('button', { name: /看原圖/ })).not.toBeInTheDocument();
  });

  it('navigates with the arrow keys and stops at the ends', async () => {
    const { onIndexChange } = setup([photo(), photo({ id: 'p2' })], 0);
    await userEvent.keyboard('{ArrowRight}');
    expect(onIndexChange).toHaveBeenCalledWith(1);
    onIndexChange.mockClear();
    await userEvent.keyboard('{ArrowLeft}'); // already at 0
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('closes on Escape and on the close control', async () => {
    const { onClose } = setup([photo()]);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    onClose.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /關閉/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it('always offers the ORIGINAL for download — the material, not the web derivative', () => {
    setup([photo({ annotated: true, urls: { display: '/d.jpg', original: '/o.jpg', annotated: '/a.jpg' } })]);
    expect(screen.getByRole('link', { name: /下載原始照片/ })).toHaveAttribute('href', '/o.jpg');
  });

  it('renders nothing rather than crashing when the index is out of range', () => {
    const { container } = render(
      <PhotoCompareLightbox
        photos={[]}
        index={0}
        blueprintImageUrl="/b.png"
        panelLabel="x"
        onClose={vi.fn()}
        onIndexChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
