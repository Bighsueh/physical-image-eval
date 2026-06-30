import { AlertTriangle } from 'lucide-react';
import type { DrillDownData } from '../../../api/admin-dashboard';
import { Card, StatusPill } from '../../ui';

/** Per-reviewer 整體判定 / 適應症判定 side-by-side for one blueprint (FR-008). v1 surfaces
 * disagreement only — no mediation (FR-018). 非在職 rows flagged. */
export function CrossReviewerTable({ data }: { data: DrillDownData }) {
  if (data.rows.length === 0) {
    return <Card className="p-6 text-ink-soft">目前沒有任何審查者提交此圖。</Card>;
  }
  return (
    <Card className="overflow-hidden">
      {data.hasDisagreement && (
        <p role="note" className="flex items-center gap-1.5 px-4 py-2 text-sm text-warn-deep bg-warn-tint border-b border-border">
          <AlertTriangle className="w-4 h-4" aria-hidden="true" />
          審查者之間對本圖的整體判定存在分歧（調解於線下處理）。
        </p>
      )}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-surface-sunken text-ink-soft border-b border-border">
            <th className="px-4 py-3 font-medium">審查者</th>
            <th className="px-4 py-3 font-medium">狀態</th>
            <th className="px-4 py-3 font-medium">整體判定</th>
            <th className="px-4 py-3 font-medium">適應症判定</th>
            <th className="px-4 py-3 font-medium">提交時間</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.accountId} className="border-b border-border last:border-0">
              <td className="px-4 py-3 text-ink">{r.displayName}</td>
              <td className="px-4 py-3">
                <StatusPill status={r.isActive ? 'active' : 'inactive'} size="sm" />
              </td>
              <td className="px-4 py-3 text-ink">{r.overallJudgement ?? '—'}</td>
              <td className="px-4 py-3 text-ink-soft">{r.indicationJudgement ?? '—'}</td>
              <td className="px-4 py-3 text-ink-soft nums">{r.submittedAt?.slice(0, 16).replace('T', ' ') ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
