import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, PencilLine, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getNext, getProgress, type ReviewStatusValue } from '../api/reviews';
import { useAuth } from '../auth/AuthContext';
import { AppHeader, Button, Card, HighRiskBadge, ProgressBar } from '../components/ui';

/** Personal progress page (US7). Counts + per-region + region/status-filterable index, all the
 * caller's own. Status shown by icon + text (constitution IX). */
const STATUS_BADGE: Record<ReviewStatusValue, { Icon: LucideIcon; cls: string }> = {
  未開始: { Icon: CircleDashed, cls: 'text-ink-soft bg-surface-sunken' },
  草稿: { Icon: PencilLine, cls: 'text-warn-deep bg-warn-tint' },
  已提交: { Icon: CheckCircle2, cls: 'text-primary-deep bg-primary-tint' },
};

function StatusBadge({ status }: { status: ReviewStatusValue }) {
  const { Icon, cls } = STATUS_BADGE[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {status}
    </span>
  );
}

const STATUSES: ReviewStatusValue[] = ['未開始', '草稿', '已提交'];

export function ReviewProgressPage() {
  const { account } = useAuth();
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['progress', region, status],
    queryFn: () => getProgress({ region: region || undefined, status: status || undefined }),
  });
  const next = useQuery({ queryKey: ['next'], queryFn: getNext });

  const select =
    'rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader userName={account ? `${account.displayName} 你好` : undefined} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <h2 className="text-2xl font-bold text-ink">我的審查進度</h2>

        <Card className="p-6 space-y-4">
          <ProgressBar value={data?.submitted ?? 0} total={data?.total ?? 51} label="已提交" />
          <div className="flex flex-wrap items-center gap-4 text-sm text-ink-soft">
            <span>草稿 {data?.draft ?? 0}</span>
            <span>未開始 {data?.notStarted ?? 51}</span>
            {next.data && (
              <span className="ml-auto">
                {next.data.completed ? (
                  <span className="text-primary-deep font-medium">全部審查完成 🎉</span>
                ) : (
                  <Link to={`/review/${next.data.next}`}>
                    <Button>繼續審查（{next.data.next}）</Button>
                  </Link>
                )}
              </span>
            )}
          </div>
        </Card>

        {data && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-primary-deep mb-3">各區域進度</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data.perRegion.map((r) => (
                <div key={r.regionCode} className="rounded-xl border border-border bg-surface p-3">
                  <p className="text-sm font-medium text-ink">
                    {r.regionCode}・{r.regionNameZh}
                  </p>
                  <p className="text-xs text-ink-soft mt-1 nums">
                    已提交 {r.submitted}／{r.total}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h3 className="text-sm font-semibold text-primary-deep">藍圖索引</h3>
            <label htmlFor="filter-region" className="sr-only">
              依區域篩選
            </label>
            <select
              id="filter-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className={select}
            >
              <option value="">全部區域</option>
              {(data?.perRegion ?? []).map((r) => (
                <option key={r.regionCode} value={r.regionCode}>
                  {r.regionCode}・{r.regionNameZh}
                </option>
              ))}
            </select>
            <label htmlFor="filter-status" className="sr-only">
              依狀態篩選
            </label>
            <select
              id="filter-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={select}
            >
              <option value="">全部狀態</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {isLoading && <p className="text-ink-soft">載入中…</p>}
          {isError && <p role="alert">無法載入進度</p>}
          {data && data.index.length === 0 && <p className="text-ink-soft">沒有符合條件的圖。</p>}

          <ul className="divide-y divide-border">
            {(data?.index ?? []).map((item) => (
              <li key={item.blueprintId}>
                <Link
                  to={`/review/${item.blueprintId}`}
                  className="flex items-center justify-between gap-3 py-2.5 hover:bg-surface-sunken/50 rounded-lg px-2 -mx-2"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-sm text-ink-soft w-10 shrink-0">{item.blueprintId}</span>
                    <span className="text-sm text-ink truncate">{item.exerciseName}</span>
                    {item.isHighRisk && <HighRiskBadge className="shrink-0" />}
                  </span>
                  <StatusBadge status={item.myStatus} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </main>
    </div>
  );
}
