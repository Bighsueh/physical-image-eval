import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PanelDoc, ReviewDoc } from '../../src/api/reviews';
import { CompletionState } from '../../src/components/review/CompletionState';
import { IndicationField } from '../../src/components/review/IndicationField';
import { PanelReviewForm } from '../../src/components/review/PanelReviewForm';
import { SubmitBar } from '../../src/components/review/SubmitBar';
import { ZoomableImage } from '../../src/components/review/ZoomableImage';

const docWith = (over: Partial<ReviewDoc> = {}): ReviewDoc => ({
  overallJudgement: null,
  indicationJudgement: null,
  indicationNote: null,
  panels: [1, 2, 3, 4].map((panelIndex) => ({
    panelIndex,
    requiredWarnings: [],
    warningOther: null,
    problemTypes: [],
    problemNote: null,
  })),
  ...over,
});

describe('ZoomableImage (FR-006 inline, no lightbox)', () => {
  it('zooms in/out/reset via buttons and keyboard, never opening a dialog', async () => {
    const user = userEvent.setup();
    render(<ZoomableImage src="/x.png" alt="S1" />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '放大' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '縮小' }));
    expect(screen.getByText('100%')).toBeInTheDocument();

    const group = screen.getByRole('group', { name: /受審圖/ });
    group.focus();
    await user.keyboard('{+}{+}');
    expect(screen.getByText('150%')).toBeInTheDocument();
    await user.keyboard('0');
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('SubmitBar (FR-030 soft prompt, FR-011 error)', () => {
  it('shows a non-blocking soft prompt for 需重做 + all-empty panels, submit still fires', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <SubmitBar
        doc={docWith({ overallJudgement: '需重做' })}
        saveState="saved"
        submitting={false}
        isResubmit={false}
        error={null}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText(/建議至少補一處問題說明/)).toBeInTheDocument();
    expect(screen.getByText('草稿已儲存')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /提交/ }));
    expect(onSubmit).toHaveBeenCalled(); // non-blocking
  });

  it('renders the inline error when provided', () => {
    render(
      <SubmitBar doc={docWith()} saveState="idle" submitting={false} isResubmit error="請先選擇整體判定" onSubmit={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('請先選擇整體判定');
    expect(screen.getByRole('button', { name: /再次提交/ })).toBeInTheDocument();
  });
});

describe('PanelReviewForm + IndicationField (FR-013..020)', () => {
  it('toggles a warning and a problem type and edits orphan free-text', async () => {
    const user = userEvent.setup();
    const handlers = {
      onToggleWarning: vi.fn(),
      onWarningOther: vi.fn(),
      onToggleProblem: vi.fn(),
      onProblemNote: vi.fn(),
    };
    const panel: PanelDoc = { panelIndex: 2, requiredWarnings: [], warningOther: null, problemTypes: [], problemNote: null };
    render(<PanelReviewForm panel={panel} handlers={handlers} />);
    await user.click(screen.getByText('注意跌倒'));
    expect(handlers.onToggleWarning).toHaveBeenCalledWith(2, '注意跌倒');
    await user.click(screen.getByText('有錯字'));
    expect(handlers.onToggleProblem).toHaveBeenCalledWith(2, '有錯字');
    await user.type(screen.getByLabelText(/問題說明/), '秒');
    expect(handlers.onProblemNote).toHaveBeenCalledWith(2, '秒');
  });

  it('IndicationField is optional and never forces a note', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<IndicationField value={null} note={null} onChange={onChange} onNoteChange={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /有疑慮/ }));
    expect(onChange).toHaveBeenCalledWith('有疑慮');
  });
});

describe('CompletionState (FR-029 non-dead-end)', () => {
  it('renders 51/51 with a back-to-progress entry point', () => {
    render(
      <MemoryRouter>
        <CompletionState total={51} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/全部審查完成（51／51）/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '回到進度頁' })).toHaveAttribute('href', '/progress');
  });
});
