import type { ReviewerRow } from '../../../api/admin-dashboard';
import { Card, StatusPill } from '../../ui';

/** Per-reviewer progress (submitted/total, unreviewed count, last submit). 非在職 flagged by text+icon. */
export function ReviewerProgressTable({ rows }: { rows: ReviewerRow[] }) {
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-surface-sunken text-ink-soft border-b border-border">
            <th className="px-4 py-3 font-medium">審查者</th>
            <th className="px-4 py-3 font-medium">狀態</th>
            <th className="px-4 py-3 font-medium">已提交</th>
            <th className="px-4 py-3 font-medium">未提交</th>
            <th className="px-4 py-3 font-medium">最近提交</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.accountId} className="border-b border-border last:border-0">
              <td className="px-4 py-3 text-ink">{r.displayName}</td>
              <td className="px-4 py-3">
                <StatusPill status={r.isActive ? 'active' : 'inactive'} size="sm" />
              </td>
              <td className="px-4 py-3 nums">
                {r.submittedCount}／{r.total}
              </td>
              <td className="px-4 py-3 nums text-ink-soft">{r.unreviewedBlueprintIds.length}</td>
              <td className="px-4 py-3 text-ink-soft">
                {r.lastSubmittedBlueprintId ? (
                  <span className="nums">
                    {r.lastSubmittedBlueprintId}
                    {r.lastSubmittedAt ? `・${r.lastSubmittedAt.slice(0, 10)}` : ''}
                  </span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
