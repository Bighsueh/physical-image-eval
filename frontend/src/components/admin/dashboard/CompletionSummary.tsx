import type { OverviewData } from '../../../api/admin-dashboard';
import { Card, ProgressBar } from '../../ui';

/** Headline completion (active basis) + summary KPIs. 非在職 submissions shown on a separate line. */
export function CompletionSummary({ data }: { data: OverviewData }) {
  const Kpi = ({ label, value }: { label: string; value: string | number }) => (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="text-xl font-bold text-ink nums">{value}</p>
    </div>
  );
  return (
    <Card className="p-6 space-y-4">
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-sm font-medium text-ink">整體完成度（在職審查者）</span>
          <span className="text-sm text-ink-soft nums">{data.percent}%</span>
        </div>
        <ProgressBar value={data.submittedActive} total={data.expectedSubmissions} label="已提交 / 應提交" />
        <p className="mt-1 text-xs text-ink-soft">
          非在職審查者已提交 {data.inactiveSubmittedTotal} 筆（另計，不併入在職完成率）
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="在職審查者" value={data.activeReviewerCount} />
        <Kpi label="已達全覆蓋圖" value={`${data.fullyCoveredCount}／${data.totalBlueprints}`} />
        <Kpi label="含需重做圖" value={data.blueprintsWithRedoCount} />
        <Kpi label="高風險圖" value={data.highRiskCount} />
      </div>
    </Card>
  );
}
