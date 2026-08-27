import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, HelpCircle, RotateCcw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  openReview,
  resetReview,
  submitReview,
  type OpenReviewData,
  type OverallJudgement,
  type ReviewDoc,
  type ReviewState,
} from '../api/reviews';
import { BlueprintMetaPanel } from '../components/review/BlueprintMetaPanel';
import { CompletionState } from '../components/review/CompletionState';
import { ImageLightbox } from '../components/review/ImageLightbox';
import { IndicationField } from '../components/review/IndicationField';
import { OverallJudgementField } from '../components/review/OverallJudgementField';
import { PanelSwitcher } from '../components/review/PanelSwitcher';
import { PhotoCompareLightbox } from '../components/review/PhotoCompareLightbox';
import { PhotoUploadField } from '../components/review/PhotoUploadField';
import { AnnotateModal } from '../features/annotate/AnnotateModal.lazy';
import { useReviewPhotos } from '../hooks/useReviewPhotos';
import type { ReviewPhoto } from '../api/review-photos';
import type { PanelReviewHandlers } from '../components/review/PanelReviewForm';
import { OVERALL_ERROR_ID, SubmitBar } from '../components/review/SubmitBar';
import { AppHeader, Card, ConfirmDialog, HighRiskBadge, ProgressBar } from '../components/ui';
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
  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  // Photos live in their own controller: writes are immediate, so they must not ride the
  // document's 800ms debounce (research D14).
  const photoCtl = useReviewPhotos(bp.blueprintId, data.review.photos ?? []);
  const [lightbox, setLightbox] = useState<{ photos: ReviewPhoto[]; index: number } | null>(null);
  const [annotating, setAnnotating] = useState<ReviewPhoto | null>(null);

  const panelPhotos = useCallback(
    (panelIndex: number | null) => photoCtl.photos.filter((p) => p.panelIndex === panelIndex),
    [photoCtl.photos],
  );
  const openLightbox = useCallback(
    (photo: ReviewPhoto) => {
      const group = photoCtl.photos.filter((p) => p.panelIndex === photo.panelIndex);
      setLightbox({ photos: group, index: Math.max(0, group.findIndex((p) => p.id === photo.id)) });
    },
    [photoCtl.photos],
  );

  /** The 參考照片 block, rendered for a panel (1..4) or for the image as a whole (null). */
  const renderPhotoField = useCallback(
    (panelIndex: number | null) => (
      <PhotoUploadField
        label={panelIndex === null ? '整體參考照片' : '參考照片'}
        hint={
          panelIndex === null
            ? '不屬於某一格、想補充整體姿勢或器材時放這裡。'
            : '用照片說明正確動作，張數不限。桌機點「上傳照片」開檔案選擇器，也可以直接把照片拖進這一區。'
        }
        photos={panelPhotos(panelIndex)}
        pending={photoCtl.pending.filter((u) => u.panelIndex === panelIndex)}
        panelIndex={panelIndex}
        storageFull={photoCtl.storageFull}
        onAdd={photoCtl.add}
        onOpen={openLightbox}
        onDelete={(id) => void photoCtl.remove(id)}
        onCaption={(id, caption) => void photoCtl.setCaption(id, caption)}
        onAnnotate={setAnnotating}
        onRetry={photoCtl.retry}
        onDismiss={photoCtl.dismiss}
      />
    ),
    [panelPhotos, photoCtl, openLightbox],
  );

  // Keep the cached ['review', id] payload in sync with what we persist. Without this, a quick
  // re-entry (query still fresh — staleTime) re-hydrates the reducer from the pre-edit cache and the
  // saved draft appears to have vanished. The draft fields ARE the ReviewState fields (same zh-TW
  // values), so we merge them over the cached review and stamp the server-returned status/timestamps.
  const syncReviewCache = useCallback(
    (doc: ReviewDoc, meta: Partial<ReviewState>) => {
      queryClient.setQueryData<OpenReviewData>(['review', bp.blueprintId], (old) =>
        old ? { ...old, review: { ...old.review, ...doc, ...meta } } : old,
      );
    },
    [queryClient, bp.blueprintId],
  );

  const { saveState, flush, skipNext } = useAutosaveReview(bp.blueprintId, draft, (doc, res) =>
    syncReviewCache(doc, {
      status: res.status,
      lastSavedAt: res.lastSavedAt,
      submittedAt: res.submittedAt,
      lastUpdatedAt: res.lastUpdatedAt,
    }),
  );
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
    mutationFn: () => submitReview(bp.blueprintId, draftRef.current),
    onSuccess: (res) => {
      // Reflect the submission in the cache so re-entering this blueprint shows the submitted content
      // (and the resubmit affordance) instead of a stale pre-submit copy.
      syncReviewCache(draftRef.current, {
        status: res.status,
        submittedAt: res.submittedAt,
        lastUpdatedAt: res.lastUpdatedAt,
      });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      if (res.completed || !res.next) setCompleted(true);
      else navigate(`/review/${res.next}`);
    },
    onError: () => setSubmitError('提交失敗，請稍後再試'),
  });

  const resetMutation = useMutation({
    // Flush FIRST: cancel any queued autosave and wait for an in-flight one to settle, so no late
    // PATCH can upsert-resurrect the row the reset is about to delete (irreversible-reset integrity).
    mutationFn: async () => {
      await flush();
      return resetReview(bp.blueprintId);
    },
    onSuccess: (fresh) => {
      // Blank the form IN PLACE (no remount → the dialog closes normally and returns focus to its
      // trigger). skipNext suppresses exactly the one autosave this programmatic change would trigger,
      // so the reset is not immediately re-created as an empty draft.
      skipNext();
      dispatch({ type: 'reset', doc: reviewToDraft(fresh.review) });
      queryClient.setQueryData<OpenReviewData>(['review', bp.blueprintId], (old) =>
        old ? { ...old, review: fresh.review, progress: fresh.progress } : old,
      );
      setActivePanel(1);
      setSubmitError(null);
      setPanelErrors(false);
      setCompleted(false);
      setResetOpen(false);
    },
    onError: () => {
      setResetOpen(false);
      setResetError('初始化失敗，請稍後再試');
    },
  });

  const { mutate: submitMutate } = submitMutation;
  const doSubmit = useCallback(() => {
    const d = draftRef.current;
    if (!d.overallJudgement) {
      setSubmitError(VALIDATION_ERRORS.judgement);
      document.getElementById('overall-judgement-anchor')?.scrollIntoView?.({ block: 'center' });
      return;
    }
    const unaddressed = d.panels
      .filter((p) => !isPanelAddressed(p, photoCtl.countFor(p.panelIndex)))
      .map((p) => p.panelIndex);
    if (unaddressed.length > 0) {
      setSubmitError(VALIDATION_ERRORS.panel);
      setPanelErrors(true);
      setActivePanel(unaddressed[0]); // jump to the first panel that needs handling
      return;
    }
    setSubmitError(null);
    setPanelErrors(false);
    submitMutate();
  }, [submitMutate, photoCtl]);

  const onJudge = useCallback((v: OverallJudgement) => dispatch({ type: 'overall', value: v }), []);
  useReviewKeyboard({ onJudge, onSubmit: doSubmit });

  // Clear each validation banner as soon as the thing it complains about is fixed (no stale banner).
  useEffect(() => {
    const allAddressed = draft.panels.every((p) => isPanelAddressed(p, photoCtl.countFor(p.panelIndex)));
    if (allAddressed) setPanelErrors(false);
    setSubmitError((prev) => {
      if (prev === VALIDATION_ERRORS.judgement && draft.overallJudgement) return null;
      if (prev === VALIDATION_ERRORS.panel && allAddressed) return null;
      return prev;
    });
  }, [draft, photoCtl]);

  if (completed) return <CompletionState total={data.progress.total} />;

  const handlers: PanelReviewHandlers = {
    onToggleNoProblem: (i) => dispatch({ type: 'toggleNoProblem', panelIndex: i }),
    onToggleWarning: (i, w) => dispatch({ type: 'toggleWarning', panelIndex: i, warning: w }),
    onWarningOther: (i, v) => dispatch({ type: 'warningOther', panelIndex: i, value: v }),
    onToggleProblem: (i, p) => dispatch({ type: 'toggleProblem', panelIndex: i, problem: p }),
    onProblemNote: (i, v) => dispatch({ type: 'problemNote', panelIndex: i, value: v }),
  };
  const invalidIndices = panelErrors
    ? draft.panels
        .filter((p) => !isPanelAddressed(p, photoCtl.countFor(p.panelIndex)))
        .map((p) => p.panelIndex)
    : [];

  return (
    <>
      {/* Overall progress stays fixed-visible at the top while the form scrolls (FR-041). */}
      <div className="sticky top-0 z-10 -mx-6 mb-4 flex items-center justify-between gap-4 border-b border-border bg-paper/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link to="/progress" className="text-sm text-primary-deep hover:underline">
            ‹ 返回進度
          </Link>
          <span className="text-border" aria-hidden="true">
            |
          </span>
          {/* Free browsing: previous / next blueprint in catalog order (distinct from submit's
              auto-advance to the next UNREVIEWED one). Disabled at the ends. */}
          <button
            type="button"
            onClick={() => data.neighbors.prev && navigate(`/review/${data.neighbors.prev}`)}
            disabled={!data.neighbors.prev}
            className="inline-flex items-center gap-0.5 text-sm text-ink hover:text-primary-deep disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            上一張
          </button>
          <button
            type="button"
            onClick={() => data.neighbors.next && navigate(`/review/${data.neighbors.next}`)}
            disabled={!data.neighbors.next}
            className="inline-flex items-center gap-0.5 text-sm text-ink hover:text-primary-deep disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下一張
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
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
              photoCounts={(i) => photoCtl.countFor(i)}
              renderPhotoSlot={(i) => renderPhotoField(i)}
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
            {/* Image-level photos: the same component, unbound to any panel (FR-046). */}
            <div className="mt-4 border-t border-border pt-3">{renderPhotoField(null)}</div>
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

          {/* Destructive, deliberately low-emphasis + reconfirm-gated: wipe this blueprint's record. */}
          <div className="flex flex-col items-end gap-1">
            {resetError && (
              <p role="alert" className="text-sm text-accent-deep">
                {resetError}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setResetError(null);
                setResetOpen(true);
              }}
              className="inline-flex items-center gap-1 text-sm text-accent-deep hover:underline"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              初始化本頁提交記錄
            </button>
          </div>
        </div>
      </div>

      {lightbox && (
        <PhotoCompareLightbox
          photos={lightbox.photos}
          index={lightbox.index}
          blueprintImageUrl={bp.imageUrl}
          panelLabel={`${bp.blueprintId} · ${bp.exerciseName}`}
          onClose={() => setLightbox(null)}
          onIndexChange={(index) => setLightbox((cur) => (cur ? { ...cur, index } : cur))}
        />
      )}

      {annotating && (
        <AnnotateModal
          blueprintId={bp.blueprintId}
          photo={annotating}
          onClose={() => setAnnotating(null)}
          onSaved={(photo) => {
            photoCtl.replace(photo);
            setAnnotating(null);
          }}
        />
      )}

      <ConfirmDialog
        open={resetOpen}
        title="初始化本頁提交記錄？"
        confirmLabel="初始化"
        loading={resetMutation.isPending}
        onConfirm={() => resetMutation.mutate()}
        onCancel={() => setResetOpen(false)}
      >
        <p>
          將清除你在<strong>本圖</strong>已填寫或已提交的所有內容，回到「未填寫」狀態。此動作無法復原。
        </p>
      </ConfirmDialog>
    </>
  );
}
