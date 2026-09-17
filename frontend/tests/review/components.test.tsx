import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PanelDoc } from '../../src/api/reviews';
import { CompletionState } from '../../src/components/review/CompletionState';
import { ImageLightbox } from '../../src/components/review/ImageLightbox';
import { IndicationField } from '../../src/components/review/IndicationField';
import { PanelReviewForm, type PanelReviewHandlers } from '../../src/components/review/PanelReviewForm';
import { PanelSwitcher } from '../../src/components/review/PanelSwitcher';
import { SubmitBar } from '../../src/components/review/SubmitBar';

const panel = (panelIndex: number, over: Partial<PanelDoc> = {}): PanelDoc => ({
  panelIndex,
  noProblem: false,
  requiredWarnings: [],
  warningOther: null,
  problemTypes: [],
  problemNote: null,
  ...over,
});
const noopHandlers: PanelReviewHandlers = {
  onToggleNoProblem: vi.fn(),
  onToggleWarning: vi.fn(),
  onWarningOther: vi.fn(),
  onToggleProblem: vi.fn(),
  onProblemNote: vi.fn(),
};

describe('PanelSwitcher (one panel at a time, position labels, status)', () => {
  function Harness({ panels, onAll = vi.fn() }: { panels: PanelDoc[]; onAll?: () => void }) {
    const [active, setActive] = useState(1);
    return (
      <PanelSwitcher
        panels={panels}
        handlers={noopHandlers}
        active={active}
        onActiveChange={setActive}
        onAllNoProblem={onAll}
      />
    );
  }

  it('labels positions, marks addressed panels, switches tabs, and has a 全部無問題 shortcut', async () => {
    const user = userEvent.setup();
    const onAll = vi.fn();
    const panels = [panel(1), panel(2, { problemNote: '第2格有問題' }), panel(3, { noProblem: true }), panel(4)];
    render(<Harness panels={panels} onAll={onAll} />);

    expect(screen.getByText(/正在評/)).toHaveTextContent('圖 1（左上）'); // position label
    expect(screen.getByRole('tab', { name: /圖 2/ })).toHaveTextContent('右上');
    expect(screen.getByRole('tab', { name: /圖 2/ })).toHaveTextContent('已處理'); // has a problem note
    expect(screen.getByRole('tab', { name: /圖 3/ })).toHaveTextContent('已處理'); // 無問題

    await user.click(screen.getByRole('tab', { name: /圖 2/ }));
    expect(screen.getByText(/正在評/)).toHaveTextContent('圖 2（右上）');

    await user.click(screen.getByRole('button', { name: '全部標示無問題' }));
    expect(onAll).toHaveBeenCalled();
  });
});

describe('ImageLightbox (FB-style full-screen preview)', () => {
  it('opens a dialog on click and closes via the ✕ button', async () => {
    const user = userEvent.setup();
    render(<ImageLightbox src="/x.png" alt="S1 圖" />);
    expect(screen.queryByRole('dialog')).toBeNull(); // closed initially
    await user.click(screen.getByRole('button', { name: /放大/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '關閉預覽' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('PanelReviewForm (無問題 sign-off OR annotate)', () => {
  it('toggles 無問題, and when unchecked exposes warning/problem inputs', async () => {
    const user = userEvent.setup();
    const handlers: PanelReviewHandlers = {
      onToggleNoProblem: vi.fn(),
      onToggleWarning: vi.fn(),
      onWarningOther: vi.fn(),
      onToggleProblem: vi.fn(),
      onProblemNote: vi.fn(),
    };
    render(<PanelReviewForm panel={panel(2)} handlers={handlers} />);
    await user.click(screen.getByRole('checkbox', { name: /此分格無問題/ }));
    expect(handlers.onToggleNoProblem).toHaveBeenCalledWith(2);
    await user.click(screen.getByText('注意跌倒'));
    expect(handlers.onToggleWarning).toHaveBeenCalledWith(2, '注意跌倒');
    await user.click(screen.getByText('有錯字'));
    expect(handlers.onToggleProblem).toHaveBeenCalledWith(2, '有錯字');
    await user.type(screen.getByLabelText(/問題說明/), '秒');
    expect(handlers.onProblemNote).toHaveBeenCalledWith(2, '秒');
  });

  it('hides the annotation fields once 無問題 is checked, and shows the invalid hint', () => {
    render(<PanelReviewForm panel={panel(1, { noProblem: true })} handlers={noopHandlers} />);
    expect(screen.queryByText('問題類型')).toBeNull(); // annotation section collapsed

    render(<PanelReviewForm panel={panel(1)} handlers={noopHandlers} invalid />);
    expect(screen.getByRole('alert')).toHaveTextContent('請勾選');
  });
});

describe('SubmitBar', () => {
  it('renders the autosave state and an inline error', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<SubmitBar saveState="saved" submitting={false} isResubmit={false} error={null} onSubmit={onSubmit} />);
    expect(screen.getByText('草稿已儲存')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /提交/ }));
    expect(onSubmit).toHaveBeenCalled();

    render(<SubmitBar saveState="idle" submitting={false} isResubmit error="請先選擇整體判定" onSubmit={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('請先選擇整體判定');
    expect(screen.getByRole('button', { name: /再次提交/ })).toBeInTheDocument();
  });
});

describe('IndicationField + CompletionState', () => {
  it('IndicationField is optional and never forces a note', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<IndicationField value={null} note={null} onChange={onChange} onNoteChange={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /有疑慮/ }));
    expect(onChange).toHaveBeenCalledWith('有疑慮');
  });

  it('CompletionState renders 40/40 with a back-to-progress entry point', () => {
    render(
      <MemoryRouter>
        <CompletionState total={40} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/全部審查完成（40／40）/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '回到進度頁' })).toHaveAttribute('href', '/progress');
  });
});
