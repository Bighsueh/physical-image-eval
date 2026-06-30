import { Download } from 'lucide-react';
import { useState } from 'react';
import { downloadExport, type ImageFilters } from '../../../api/admin-dashboard';
import { Button } from '../../ui';

/** Triggers the CSV download (GET → blob → save). Keyboard-operable (a real button). */
export function ExportButton({ filters }: { filters: ImageFilters }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      // The export endpoint only honors hasRedo/highRisk (notFullyCovered is dashboard-only). Forward
      // exactly those so the CSV matches what the supported filters imply — never silently dropped.
      await downloadExport({ hasRedo: filters.hasRedo, highRisk: filters.highRisk });
    } catch {
      setError('匯出失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={onClick} loading={busy}>
        <Download className="w-4 h-4" aria-hidden="true" />
        匯出 CSV
      </Button>
      {filters.notFullyCovered && (
        <span className="text-xs text-ink-soft">（匯出不套用「尚未達全覆蓋」篩選）</span>
      )}
      {error && (
        <span role="alert" className="text-sm text-accent-deep">
          {error}
        </span>
      )}
    </div>
  );
}
