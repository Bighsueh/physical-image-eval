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
      await downloadExport(filters);
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
      {error && (
        <span role="alert" className="text-sm text-accent-deep">
          {error}
        </span>
      )}
    </div>
  );
}
