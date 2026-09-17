import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  PartyPopper,
  PencilLine,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getNext, getProgress, type ReviewStatusValue } from '../api/reviews';
import { useAuth } from '../auth/AuthContext';
import { AppHeader, Card, HighRiskBadge, ProgressBar } from '../components/ui';

/** Personal progress page (US7). Counts + per-region + region/status-filterable status list, all the
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

  const submitted = data?.submitted ?? 0;
  const completed = next.data?.completed ?? false;
  const nextId = next.data?.next ?? null;
  const ctaLabel = submitted === 0 ? '開始審查' : '繼續審查';

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader userName={account ? `${account.displayName} 你好` : undefined} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <h2 className="text-2xl font-bold text-ink">我的審查進度</h2>

        {/* Hero: the primary action is unmistakable — a big start/continue button. */}
        <Card className="p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-2">
              <ProgressBar value={submitted} total={data?.total ?? 0} label="已提交" />
              <div className="flex flex-wrap items-center gap-4 text-sm text-ink-soft">
                <span>草稿 {data?.draft ?? 0}</span>
                <span>未開始 {data?.notStarted ?? 0}</span>
              </div>
            </div>
            <div className="shrink-0">
              {completed ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-primary-deep">
                  <PartyPopper className="w-5 h-5" aria-hidden="true" />
                  全部審查完成
                </span>
              ) : (
                nextId && (
                  // Single interactive element (a styled link) — never <a><button> (a11y review).
                  <Link
                    to={`/review/${nextId}`}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-medium text-white transition-colors hover:bg-primary-deep"
                  >
                    {ctaLabel}
                    <ArrowRight className="w-5 h-5" aria-hidden="true" />
                  </Link>
                )
              )}
            </div>
          </div>
        </Card>

        {/* Status list — the primary way to pick any image to review. */}
        <Card className="p-4">
          <div className="mb-1 flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-bold text-ink">審查狀態列表</h3>
            <label htmlFor="filter-region" className="sr-only">
              依區域篩選
            </label>
            <select
              id="filter-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className={`${select} ml-auto`}
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
          <p className="mb-3 text-sm text-ink-soft">點任一列即可開始或繼續審查該圖。</p>

          {isLoading && <p className="text-ink-soft">載入中…</p>}
          {isError && <p role="alert">無法載入進度</p>}
          {data && data.index.length === 0 && <p className="text-ink-soft">沒有符合條件的圖。</p>}

          <ul className="divide-y divide-border">
            {(data?.index ?? []).map((item) => (
              <li key={item.blueprintId}>
                <Link
                  to={`/review/${item.blueprintId}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-sunken/50"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-10 shrink-0 font-mono text-sm text-ink-soft">{item.blueprintId}</span>
                    <span className="truncate text-sm text-ink">{item.exerciseName}</span>
                    {item.isHighRisk && <HighRiskBadge className="shrink-0" />}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={item.myStatus} />
                    <ChevronRight className="w-4 h-4 text-ink-soft" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        {/* Per-region progress — de-emphasized, collapsed by default. */}
        {data && (
          <details className="rounded-2xl border border-border bg-surface/60">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-ink-soft hover:text-ink">
              各區域進度（點開查看）
            </summary>
            <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-4">
              {data.perRegion.map((r) => (
                <div key={r.regionCode} className="rounded-xl border border-border bg-surface p-3">
                  <p className="text-sm font-medium text-ink">
                    {r.regionCode}・{r.regionNameZh}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft nums">
                    已提交 {r.submitted}／{r.total}
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}
      </main>
    </div>
  );
}
