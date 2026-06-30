import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useCallback, useReducer, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { openReview, submitReview, type OpenReviewData, type OverallJudgement } from '../api/reviews';
import { BlueprintMetaPanel } from '../components/review/BlueprintMetaPanel';
import { CompletionState } from '../components/review/CompletionState';
import { IndicationField } from '../components/review/IndicationField';
import { OverallJudgementField } from '../components/review/OverallJudgementField';
import { PanelReviewForm, type PanelReviewHandlers } from '../components/review/PanelReviewForm';
import { OVERALL_ERROR_ID, SubmitBar } from '../components/review/SubmitBar';
import { ZoomableImage } from '../components/review/ZoomableImage';
import { AppHeader, Card, HighRiskBadge, ProgressBar } from '../components/ui';
import { useAutosaveReview } from '../hooks/useAutosaveReview';
import { useReviewKeyboard } from '../hooks/useReviewKeyboard';
import { reviewDraftReducer, reviewToDraft } from '../state/reviewDraft';

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
  const saveState = useAutosaveReview(bp.blueprintId, draft);

  const submitMutation = useMutation({
    mutationFn: () => submitReview(bp.blueprintId, draft),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      if (res.completed || !res.next) setCompleted(true);
      else navigate(`/review/${res.next}`);
    },
  });

  const doSubmit = useCallback(() => {
    if (!draft.overallJudgement) {
      setSubmitError('請先選擇整體判定');
      document.getElementById('overall-judgement-anchor')?.scrollIntoView?.({ block: 'center' });
      return;
    }
    setSubmitError(null);
    submitMutation.mutate();
  }, [draft.overallJudgement, submitMutation]);

  const onJudge = useCallback((v: OverallJudgement) => dispatch({ type: 'overall', value: v }), []);
  useReviewKeyboard({ onJudge, onSubmit: doSubmit });

  if (completed) return <CompletionState total={data.progress.total} />;

  const handlers: PanelReviewHandlers = {
    onToggleWarning: (i, w) => dispatch({ type: 'toggleWarning', panelIndex: i, warning: w }),
    onWarningOther: (i, v) => dispatch({ type: 'warningOther', panelIndex: i, value: v }),
    onToggleProblem: (i, p) => dispatch({ type: 'toggleProblem', panelIndex: i, problem: p }),
    onProblemNote: (i, v) => dispatch({ type: 'problemNote', panelIndex: i, value: v }),
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-4">
        <Link to="/progress" className="text-sm text-primary-deep hover:underline">
          ‹ 返回進度
        </Link>
        <div className="w-56">
          <ProgressBar value={data.progress.submitted} total={data.progress.total} label="已提交" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-xl font-bold text-ink">
          {bp.blueprintId}・{bp.exerciseName}
        </h2>
        <span className="text-sm text-ink-soft">{bp.regionNameZh}</span>
        {bp.isHighRisk && <HighRiskBadge />}
      </div>

      {bp.isHighRisk && (
        <Card tone="risk" className="p-3 mb-5 flex items-center gap-2 text-sm text-accent-deep">
          <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
          本圖涉及術後／骨折等高風險情境，請特別確認安全與禁忌（此提示不影響填寫與提交）。
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:sticky lg:top-4 self-start space-y-4">
          <ZoomableImage src={bp.imageUrl} alt={`${bp.blueprintId} ${bp.exerciseName}`} />
          <Card className="p-4">
            <BlueprintMetaPanel blueprint={bp} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-4 space-y-5">
            <div id="overall-judgement-anchor">
              <OverallJudgementField
                value={draft.overallJudgement}
                onChange={(v) => dispatch({ type: 'overall', value: v })}
                errorId={submitError ? OVERALL_ERROR_ID : undefined}
              />
            </div>
            <IndicationField
              value={draft.indicationJudgement}
              note={draft.indicationNote}
              onChange={(v) => dispatch({ type: 'indication', value: v })}
              onNoteChange={(v) => dispatch({ type: 'indicationNote', value: v })}
            />
          </Card>

          <div className="space-y-3">
            {draft.panels.map((p) => (
              <PanelReviewForm key={p.panelIndex} panel={p} handlers={handlers} />
            ))}
          </div>

          <SubmitBar
            doc={draft}
            saveState={saveState}
            submitting={submitMutation.isPending}
            isResubmit={data.review.status === '已提交'}
            error={submitError}
            onSubmit={doSubmit}
          />
        </div>
      </div>
    </>
  );
}
