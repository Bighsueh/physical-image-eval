/** Rounded progress bar with a tabular `value／total` readout. Accessible (role=progressbar). */
export function ProgressBar({
  value,
  total,
  label,
}: {
  value: number;
  total: number;
  label?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        {label && <span className="text-sm text-ink-soft">{label}</span>}
        <span className="text-sm font-medium nums" aria-label={`審查進度 ${value} / ${total}`}>
          {value}／{total}
        </span>
      </div>
      <div
        className="h-2.5 rounded-full bg-surface-sunken overflow-hidden"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
