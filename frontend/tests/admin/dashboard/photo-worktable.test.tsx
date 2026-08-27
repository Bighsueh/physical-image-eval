import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WorkTableEntry, WorkTablePanel } from '../../../src/api/admin-dashboard';
import { PanelGroup } from '../../../src/components/admin/dashboard/PanelGroup';
import { ReviewerEntryRow } from '../../../src/components/admin/dashboard/ReviewerEntry';

const entry = (over: Partial<WorkTableEntry> = {}): WorkTableEntry => ({
  reviewerDisplayName: '甲醫師',
  isActive: true,
  overallJudgement: '需小修',
  requiredWarnings: [],
  warningOther: null,
  problemTypes: ['動作示範錯誤'],
  problemNote: '拇指應收進掌心',
  photos: [],
  submittedAt: '2026-08-26T01:48:00Z',
  ...over,
});

const panel = (over: Partial<WorkTablePanel> = {}): WorkTablePanel => ({
  panelIndex: 1,
  stepName: 'Finkelstein 伸展',
  flaggedReviewerCount: 1,
  photoCount: 0,
  allClear: false,
  entries: [entry()],
  ...over,
});

describe('PanelGroup — the unit the repair decision is made in', () => {
  it('names the panel by index, position and step', () => {
    render(<PanelGroup panel={panel()} />);
    expect(screen.getByText(/圖1（左上）/)).toBeInTheDocument();
    expect(screen.getByText(/Finkelstein 伸展/)).toBeInTheDocument();
  });

  it('states how many flagged it, and how many photos are waiting', () => {
    render(<PanelGroup panel={panel({ flaggedReviewerCount: 2, photoCount: 3 })} />);
    expect(screen.getByText('2 位標了問題')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('張參考照片')).toBeInTheDocument();
  });

  it('collapses an all-clear panel to one line — no entries to read', () => {
    render(<PanelGroup panel={panel({ allClear: true, flaggedReviewerCount: 0, entries: [] })} />);
    expect(screen.getByText('全員無問題')).toBeInTheDocument();
    expect(screen.queryByText('甲醫師')).not.toBeInTheDocument();
  });

  it('distinguishes "nobody flagged it" from "nobody has reviewed it"', () => {
    render(<PanelGroup panel={panel({ allClear: false, flaggedReviewerCount: 0, entries: [] })} />);
    expect(screen.getByText('尚無提交')).toBeInTheDocument();
    expect(screen.queryByText('全員無問題')).not.toBeInTheDocument();
  });
});

describe('ReviewerEntryRow — one finding, with its evidence attached', () => {
  it('shows the judgement, the problem types and the note together', () => {
    render(<ReviewerEntryRow entry={entry()} />);
    expect(screen.getByText('甲醫師')).toBeInTheDocument();
    expect(screen.getByText('動作示範錯誤')).toBeInTheDocument();
    expect(screen.getByText('需小修')).toBeInTheDocument();
    expect(screen.getByText('拇指應收進掌心')).toBeInTheDocument();
  });

  it('flags a 非在職 reviewer without hiding their submitted finding', () => {
    render(<ReviewerEntryRow entry={entry({ isActive: false })} />);
    expect(screen.getByText('非在職')).toBeInTheDocument();
    expect(screen.getByText('甲醫師')).toBeInTheDocument();
  });

  it('renders warnings and the free-text warning supplement', () => {
    render(<ReviewerEntryRow entry={entry({ requiredWarnings: ['骨鬆注意'], warningOther: '需兩人協助' })} />);
    expect(screen.getByText('骨鬆注意')).toBeInTheDocument();
    expect(screen.getByText(/需兩人協助/)).toBeInTheDocument();
  });

  it('shows the annotated thumbnail but always links the ORIGINAL for download', () => {
    render(
      <ReviewerEntryRow
        entry={entry({
          photos: [
            {
              photoId: 'p1',
              caption: '正確角度',
              hasAnnotated: true,
              urls: { display: '/d.jpg', original: '/o.jpg', annotated: '/a.jpg' },
            },
          ],
        })}
      />,
    );
    expect(screen.getByRole('img', { name: '正確角度' })).toHaveAttribute('src', '/a.jpg');
    expect(screen.getByRole('link', { name: /開啟原始照片/ })).toHaveAttribute('href', '/o.jpg');
    expect(screen.getByRole('link', { name: /下載原始照片/ })).toHaveAttribute('href', '/o.jpg');
  });

  it('omits the download control entirely when there is nothing to download', () => {
    render(<ReviewerEntryRow entry={entry()} />);
    expect(screen.queryByRole('link', { name: /下載原始照片/ })).not.toBeInTheDocument();
  });
});
