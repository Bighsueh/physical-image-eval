import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  PencilLine,
  RotateCcw,
  ShieldAlert,
  UserCheck,
  UserX,
  type LucideIcon,
} from 'lucide-react';

/**
 * Status pill — ALWAYS icon + text (constitution IX: never color-only). Covers the review
 * verdicts, per-dimension marks, high-risk flag, review status, and reviewer employment status.
 */
export type Status =
  | 'pass'
  | 'needs-fix'
  | 'minor'
  | 'redo'
  | 'high-risk'
  | 'unreviewed'
  | 'active'
  | 'inactive';

const MAP: Record<Status, { label: string; Icon: LucideIcon; cls: string }> = {
  pass: { label: '通過', Icon: CheckCircle2, cls: 'text-primary-deep bg-primary-tint' },
  'needs-fix': { label: '需修改', Icon: PencilLine, cls: 'text-accent-deep bg-accent-tint' },
  minor: { label: '需小修', Icon: AlertTriangle, cls: 'text-warn-deep bg-warn-tint' },
  redo: { label: '需重做', Icon: RotateCcw, cls: 'text-white bg-accent' },
  'high-risk': { label: '高風險', Icon: ShieldAlert, cls: 'text-white bg-accent' },
  unreviewed: { label: '未審', Icon: CircleDashed, cls: 'text-ink-soft bg-surface-sunken' },
  active: { label: '在職', Icon: UserCheck, cls: 'text-primary-deep bg-primary-tint' },
  inactive: { label: '非在職', Icon: UserX, cls: 'text-ink-soft bg-surface-sunken' },
};

export function StatusPill({ status, size = 'md' }: { status: Status; size?: 'sm' | 'md' }) {
  const { label, Icon, cls } = MAP[status];
  const pad = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${pad} ${cls}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Prominent high-risk badge (S4/T8/P1/P4/P5/K2/K3/K5/L3). Always paired with its tooltip. */
export function HighRiskBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="術後／骨折，禁忌務必確認"
      className={`inline-flex items-center gap-1 rounded-full bg-accent text-white text-sm font-medium px-2.5 py-1 ${className}`}
    >
      <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
      高風險
    </span>
  );
}
