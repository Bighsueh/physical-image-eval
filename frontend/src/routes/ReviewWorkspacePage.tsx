import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, HelpCircle, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { openReview, submitReview, type OpenReviewData, type OverallJudgement } from '../api/reviews';
import { BlueprintMetaPanel } from '../components/review/BlueprintMetaPanel';
import { CompletionState } from '../components/review/CompletionState';
import { ImageLightbox } from '../components/review/ImageLightbox';
import { IndicationField } from '../components/review/IndicationField';
import { OverallJudgementField } from '../components/review/OverallJudgementField';
import { PanelSwitcher } from '../components/review/PanelSwitcher';
import type { PanelReviewHandlers } from '../components/review/PanelReviewForm';
import { OVERALL_ERROR_ID, SubmitBar } from '../components/review/SubmitBar';
import { AppHeader, Card, HighRiskBadge, ProgressBar } from '../components/ui';
import { useAutosaveReview } from '../hooks/useAutosaveReview';
import { useReviewKeyboard } from '../hooks/useReviewKeyboard';
import { REVIEW_TOUR_SEEN_KEY, startReviewTour } from '../lib/reviewTour';
import { isPanelAddressed, reviewDraftReducer, reviewToDraft } from '../state/reviewDraft';

const VALIDATION_ERRORS = {
  judgement: '請先選擇整體判定',
  panel: '每個分格請勾選「無問題」或標注問題',
} as const;

/** Per-image review screen — Layout A (US1–US6). The inner editor is keyed by blueprintId so each
 * blueprint gets a fresh draft + autosave lifecycle (clean auto-advance). */
export function ReviewWorkspacePage() {
  const { blueprintId } = useParams<{ blueprintId: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['review', blueprintId],
    queryFn: () => openReview(blueprintId!),
    enabled: Boolean(blueprintId),
  });

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader />
      <main className="max-w-6xl mx-auto px-6 py-6">
        {isLoading && <p className="text-ink-soft">載入中…</p>}
        {isError && (
          <p role="alert" className="flex items-center gap-1.5 text-accent-deep">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            找不到該藍圖或載入失敗。
          </p>
        )}
        {data && <ReviewEditor key={blueprintId} data={data} />}
      </main>
    </div>
  );
}

function ReviewEditor({ data }: { data: OpenReviewData }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bp = data.blueprint;
  const [draft, dispatch] = useReducer(reviewDraftReducer, data.review, reviewToDraft);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [activePanel, setActivePanel] = useState(1);
  const [panelErrors, setPanelErrors] = useState(false);
  const saveState = useAutosaveReview(bp.blueprintId, draft);
  const draftRef = useRef(draft); // latest draft for the stable submit callback (no keyboard re-bind)
  draftRef.current = draft;

  // First-ever review screen: auto-run the guided tour once (defensive — never crash on it).
  const tourTried = useRef(false);
  useEffect(() => {
    if (tourTried.current) return;
    tourTried.current = true;
    try {
      if (!localStorage.getItem(REVIEW_TOUR_SEEN_KEY)) {
        localStorage.setItem(REVIEW_TOUR_SEEN_KEY, '1');
        startReviewTour();
      }
    } catch {
      /* tour is best-effort; the UI works without it */
    }
  }, []);

  const submitMutation = useMutation({
    mutationFn: () => submitReview(bp.blueprintId, draft),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      if (res.completed || !res.next) setCompleted(true);
      else navigate(`/review/${res.next}`);
    },
    onError: () => setSubmitError('提交失敗，請稍後再試'),
  });

  const { mutate: submitMutate } = submitMutation;
  const doSubmit = useCallback(() => {
    const d = draftRef.current;
    if (!d.overallJudgement) {
      setSubmitError(VALIDATION_ERRORS.judgement);
      document.getElementById('overall-judgement-anchor')?.scrollIntoView?.({ block: 'center' });
      return;
    }
    const unaddressed = d.panels.filter((p) => !isPanelAddressed(p)).map((p) => p.panelIndex);
    if (unaddressed.length > 0) {
      setSubmitError(VALIDATION_ERRORS.panel);
      setPanelErrors(true);
      setActivePanel(unaddressed[0]); // jump to the first panel that needs handling
      return;
    }
    setSubmitError(null);
    setPanelErrors(false);
    submitMutate();
  }, [submitMutate]);

  const onJudge = useCallback((v: OverallJudgement) => dispatch({ type: 'overall', value: v }), []);
  useReviewKeyboard({ onJudge, onSubmit: doSubmit });

  // Clear each validation banner as soon as the thing it complains about is fixed (no stale banner).
  useEffect(() => {
    const allAddressed = draft.panels.every(isPanelAddressed);
    if (allAddressed) setPanelErrors(false);
    setSubmitError((prev) => {
      if (prev === VALIDATION_ERRORS.judgement && draft.overallJudgement) return null;
      if (prev === VALIDATION_ERRORS.panel && allAddressed) return null;
      return prev;
    });
  }, [draft]);

  if (completed) return <CompletionState total={data.progress.total} />;

  const handlers: PanelReviewHandlers = {
    onToggleNoProblem: (i) => dispatch({ type: 'toggleNoProblem', panelIndex: i }),
    onToggleWarning: (i, w) => dispatch({ type: 'toggleWarning', panelIndex: i, warning: w }),
    onWarningOther: (i, v) => dispatch({ type: 'warningOther', panelIndex: i, value: v }),
    onToggleProblem: (i, p) => dispatch({ type: 'toggleProblem', panelIndex: i, problem: p }),
    onProblemNote: (i, v) => dispatch({ type: 'problemNote', panelIndex: i, value: v }),
  };
  const invalidIndices = panelErrors
    ? draft.panels.filter((p) => !isPanelAddressed(p)).map((p) => p.panelIndex)
    : [];

  return (
    <>
      {/* Overall progress stays fixed-visible at the top while the form scrolls (FR-041). */}
      <div className="sticky top-0 z-10 -mx-6 mb-4 flex items-center justify-between gap-4 border-b border-border bg-paper/95 px-6 py-3 backdrop-blur">
        <Link to="/progress" className="text-sm text-primary-deep hover:underline">
          ‹ 返回進度
        </Link>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={startReviewTour}
            className="inline-flex items-center gap-1 text-sm text-primary-deep hover:underline"
          >
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
            操作說明
          </button>
          <div className="w-48">
            <ProgressBar value={data.progress.submitted} total={data.progress.total} label="已提交" />
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-ink">
          {bp.blueprintId}・{bp.exerciseName}
        </h2>
        <span className="text-sm text-ink-soft">{bp.regionNameZh}</span>
        {bp.isHighRisk && <HighRiskBadge />}
      </div>

      {bp.isHighRisk && (
        <Card tone="risk" className="mb-5 flex items-center gap-2 p-3 text-sm text-accent-deep">
          <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
          本圖涉及術後／骨折等高風險情境，請特別確認安全與禁忌（此提示不影響填寫與提交）。
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT — what & why, then image + read-only plan (sticky). */}
        <div className="self-start lg:sticky lg:top-[4.5rem] space-y-3">
          <p data-tour="left-intro" className="text-sm text-ink-soft">
            左側為<strong className="text-ink">受審圖與藍圖企劃（唯讀）</strong>。請對照圖片與下方說明，逐項在右側填寫你的判定——右側的輸入不會改動這裡。
          </p>
          <ImageLightbox src={bp.imageUrl} alt={`${bp.blueprintId} ${bp.exerciseName}`} />
          <Card className="p-4">
            <BlueprintMetaPanel blueprint={bp} />
          </Card>
        </div>

        {/* RIGHT — the review form: overall + indication, then one panel at a time. */}
        <div className="space-y-5">
          <Card data-tour="judgement" className="space-y-5 p-4">
            <div id="overall-judgement-anchor">
              <OverallJudgementField
                value={draft.overallJudgement}
                onChange={(v) => dispatch({ type: 'overall', value: v })}
                errorId={submitError === VALIDATION_ERRORS.judgement ? OVERALL_ERROR_ID : undefined}
              />
            </div>
            <IndicationField
              value={draft.indicationJudgement}
              note={draft.indicationNote}
              onChange={(v) => dispatch({ type: 'indication', value: v })}
              onNoteChange={(v) => dispatch({ type: 'indicationNote', value: v })}
            />
          </Card>

          <Card className="p-4">
            <PanelSwitcher
              panels={draft.panels}
              handlers={handlers}
              active={activePanel}
              onActiveChange={setActivePanel}
              invalidIndices={invalidIndices}
              onAllNoProblem={() => dispatch({ type: 'allNoProblem' })}
            />
          </Card>

          <Card className="p-4">
            <label htmlFor="otherComment" className="text-sm font-semibold text-ink">
              其他意見 <span className="font-normal text-ink-soft">（選填）</span>
            </label>
            <p className="mt-0.5 text-xs text-ink-soft">整體性的補充意見或建議，不限格式。</p>
            <textarea
              id="otherComment"
              value={draft.otherComment ?? ''}
              onChange={(e) => dispatch({ type: 'otherComment', value: e.target.value })}
              rows={3}
              className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Card>

          <div data-tour="submit">
            <SubmitBar
              saveState={saveState}
              submitting={submitMutation.isPending}
              isResubmit={data.review.status === '已提交'}
              error={submitError}
              onSubmit={doSubmit}
            />
          </div>
        </div>
      </div>
    </>
  );
}
