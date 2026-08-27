import { AlertTriangle, HardDrive } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getStorageUsage } from '../../../api/admin-dashboard';
import { Card } from '../../ui';

const GB = 1024 ** 3;
const gb = (bytes: number): string => `${(bytes / GB).toFixed(1)} GB`;

/**
 * 照片佔用空間 (FR-034).
 *
 * The ceiling is close enough to plausible usage that silent exhaustion is a real risk, and the
 * failure it would otherwise produce is a raw write error surfaced to a clinician mid-review.
 * The number is shown alongside the limit — a bare percentage tells you nothing about how much
 * room is left in absolute terms.
 */
export function StorageUsagePanel() {
  const { data } = useQuery({ queryKey: ['admin-photo-storage'], queryFn: getStorageUsage });
  if (!data) return null;

  const warn = data.warning !== 'none';
  return (
    <Card className={`p-4 ${warn ? 'border-accent' : ''}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
          <HardDrive className="w-4 h-4" aria-hidden="true" />
          參考照片佔用空間
        </span>
        <span className="text-sm nums text-ink">
          已用 {gb(data.usedBytes)} / {gb(data.limitBytes)}（{data.usedPercent}%）
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-surface-sunken overflow-hidden">
        <div
          className={`h-full rounded-full ${warn ? 'bg-accent' : 'bg-primary'}`}
          style={{ width: `${Math.min(100, data.usedPercent)}%` }}
        />
      </div>
      {warn && (
        // Icon + text, never colour alone.
        <p role="status" className="mt-2 flex items-start gap-1.5 text-xs text-accent-deep">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {data.warning === 'full'
            ? '空間已滿，審查者無法再上傳照片。審查本身不受影響，但請儘快處理。'
            : '空間已使用超過八成，請留意。'}
        </p>
      )}
    </Card>
  );
}
