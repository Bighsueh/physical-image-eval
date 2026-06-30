import type { ImageFilters as Filters } from '../../../api/admin-dashboard';

/** Combinable image filters (含需重做 / 高風險 / 尚未達全覆蓋). Keyboard-operable checkboxes. */
export function ImageFilters({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const Toggle = ({ field, label }: { field: keyof Filters; label: string }) => (
    <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-sunken">
      <input
        type="checkbox"
        checked={Boolean(value[field])}
        onChange={(e) => onChange({ ...value, [field]: e.target.checked })}
        className="accent-primary"
      />
      {label}
    </label>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Toggle field="hasRedo" label="含需重做" />
      <Toggle field="highRisk" label="高風險" />
      <Toggle field="notFullyCovered" label="尚未達全覆蓋" />
    </div>
  );
}
