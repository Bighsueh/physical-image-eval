import { Check, Paperclip } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ImageRow } from '../../../api/admin-dashboard';
import { Card, HighRiskBadge, StatusPill } from '../../ui';

/** Per-image coverage + 整體判定 distribution. Drill-down link per row. Status by text+icon. */
export function ImageCoverageTable({ rows }: { rows: ImageRow[] }) {
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-surface-sunken text-ink-soft border-b border-border">
            <th className="px-4 py-3 font-medium">藍圖</th>
            <th className="px-4 py-3 font-medium">覆蓋</th>
            <th className="px-4 py-3 font-medium">判定分佈（在職）</th>
            <th className="px-4 py-3 font-medium text-right">附照片</th>
            <th className="px-4 py-3 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.blueprintId} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-ink-soft">{i.blueprintId}</span>
                  <span className="text-ink truncate max-w-[16rem]">{i.exerciseName}</span>
                  {i.isHighRisk && <HighRiskBadge />}
                </div>
              </td>
              <td className="px-4 py-3">
                {i.fullCoverage ? (
                  <span className="inline-flex items-center gap-1 text-primary-deep">
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    全覆蓋
                  </span>
                ) : (
                  <span className="text-ink-soft nums">
                    {i.submittedActiveCount} 已提交・缺 {i.missingReviewers.length}
                  </span>
                )}
                {i.inactiveSubmittedCount > 0 && (
                  <span className="ml-2 text-xs text-ink-soft">（非在職 {i.inactiveSubmittedCount}）</span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-3 nums">
                  <span>通過 {i.distribution.通過}</span>
                  <span>需小修 {i.distribution.需小修}</span>
                  {i.hasRedo ? <StatusPill status="redo" size="sm" /> : <span>需重做 0</span>}
                </span>
              </td>
              <td className="px-4 py-3 text-right nums">
                {(i.photoCount ?? 0) > 0 ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full border border-warn bg-warn-tint px-2 text-xs font-semibold text-warn-deep">
                    <Paperclip className="w-3 h-3" aria-hidden="true" />
                    {i.photoCount}
                    <span className="sr-only">張參考照片</span>
                  </span>
                ) : (
                  <span className="text-ink-soft">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Link to={`/admin/dashboard/images/${i.blueprintId}`} className="text-primary-deep hover:underline">
                  逐位明細 ›
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
