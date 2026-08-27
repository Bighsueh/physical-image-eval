import { useQuery } from '@tanstack/react-query';
import { Download, Paperclip } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { bundleUrl, getDrillDown, getWorkTable } from '../../../api/admin-dashboard';
import { CrossReviewerTable } from '../../../components/admin/dashboard/CrossReviewerTable';
import { PanelGroup } from '../../../components/admin/dashboard/PanelGroup';
import { ReviewerEntryRow } from '../../../components/admin/dashboard/ReviewerEntry';
import { AppHeader, Card, HighRiskBadge } from '../../../components/ui';

/**
 * 修圖工作台 — single-image view (FR-026, research D11).
 *
 * The admin's task here is not "read opinions" but "decide how to fix this image", and that
 * decision is made panel by panel. So the blueprint sits on one side and the four panel groups
 * on the other, each carrying the judgements, notes and photos that apply to it. The flat
 * cross-reviewer comparison is kept below, where disagreement is still worth seeing whole.
 */
export function ImageDrillDownPage() {
  const { blueprintId } = useParams<{ blueprintId: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-drilldown', blueprintId],
    queryFn: () => getDrillDown(blueprintId!),
    enabled: Boolean(blueprintId),
  });
  const { data: work } = useQuery({
    queryKey: ['admin-worktable', blueprintId],
    queryFn: () => getWorkTable(blueprintId!),
    enabled: Boolean(blueprintId),
  });

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader
        title="審查儀表板"
        right={
          <Link to="/admin/dashboard" className="text-white/90 hover:text-white underline">
            返回儀表板
          </Link>
        }
      />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-4">
        {isLoading && <p className="text-ink-soft">載入中…</p>}
        {isError && <p role="alert">找不到該藍圖或載入失敗。</p>}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-ink">
                {data.summary.blueprintId}・{data.summary.exerciseName}
              </h2>
              {data.summary.isHighRisk && <HighRiskBadge />}
              {(work?.photoCount ?? 0) > 0 && (
                <a
                  href={bundleUrl(work!.blueprintId)}
                  download
                  className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-deep"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  下載本圖全部材料
                </a>
              )}
            </div>

            <Card className="p-4 text-sm text-ink-soft nums flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                已提交（在職）{data.summary.submittedActiveCount}・通過 {data.summary.distribution.通過}／需小修{' '}
                {data.summary.distribution.需小修}／需重做 {data.summary.distribution.需重做}
              </span>
              {work?.photoCount != null && (
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
                  參考照片 {work.photoCount} 張
                </span>
              )}
            </Card>

            {work?.panels?.length ? (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr] items-start">
                <Card className="p-2 lg:sticky lg:top-4">
                  <img
                    src={`/api/blueprints/${work.blueprintId}/image`}
                    alt={`${work.blueprintId} ${work.exerciseName}`}
                    className="w-full rounded-lg"
                  />
                  <p className="mt-1.5 px-1 text-xs text-ink-soft">目前上線中的版本</p>
                </Card>

                <div className="space-y-3">
                  {work.panels.map((panel) => (
                    <PanelGroup key={panel.panelIndex} panel={panel} />
                  ))}

                  {(work.imageLevelEntries?.length ?? 0) > 0 && (
                    <section className="rounded-xl border border-border bg-surface overflow-hidden">
                      <div className="border-b border-border bg-surface-sunken px-3 py-2 text-sm font-medium text-ink-soft">
                        整體參考照片
                      </div>
                      {work.imageLevelEntries!.map((entry) => (
                        <ReviewerEntryRow key={`img-${entry.reviewerDisplayName}`} entry={entry} />
                      ))}
                    </section>
                  )}
                </div>
              </div>
            ) : null}

            <CrossReviewerTable data={data} />
          </>
        )}
      </main>
    </div>
  );
}
