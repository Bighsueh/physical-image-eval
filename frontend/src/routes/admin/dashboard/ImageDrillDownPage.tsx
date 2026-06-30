import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getDrillDown } from '../../../api/admin-dashboard';
import { CrossReviewerTable } from '../../../components/admin/dashboard/CrossReviewerTable';
import { AppHeader, Card, HighRiskBadge } from '../../../components/ui';

/** Single-image cross-reviewer drill-down (FR-008/018) — surfaces disagreement, no mediation. */
export function ImageDrillDownPage() {
  const { blueprintId } = useParams<{ blueprintId: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-drilldown', blueprintId],
    queryFn: () => getDrillDown(blueprintId!),
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
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {isLoading && <p className="text-ink-soft">載入中…</p>}
        {isError && <p role="alert">找不到該藍圖或載入失敗。</p>}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-ink">
                {data.summary.blueprintId}・{data.summary.exerciseName}
              </h2>
              {data.summary.isHighRisk && <HighRiskBadge />}
            </div>
            <Card className="p-4 text-sm text-ink-soft nums">
              已提交（在職）{data.summary.submittedActiveCount}・通過 {data.summary.distribution.通過}／需小修{' '}
              {data.summary.distribution.需小修}／需重做 {data.summary.distribution.需重做}
            </Card>
            <CrossReviewerTable data={data} />
          </>
        )}
      </main>
    </div>
  );
}
