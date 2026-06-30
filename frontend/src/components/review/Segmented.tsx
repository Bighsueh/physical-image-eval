/**
 * Accessible single-select segmented control (radiogroup of buttons). Keyboard: arrows move and
 * select, Home/End jump. Selection conveyed by aria-checked + a check mark + weight — not color
 * alone (constitution IX). Used for 整體判定 and 適應症／診斷對應.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  selectedClass: string; // design-system tone when selected
}

interface SegmentedProps<T extends string> {
  legend: string;
  options: SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowDeselect?: boolean;
  describedBy?: string;
}

export function Segmented<T extends string>({
  legend,
  options,
  value,
  onChange,
  allowDeselect = false,
  describedBy,
}: SegmentedProps<T>) {
  const move = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.value === value);
    const nextIndex = i === -1 ? (dir === 1 ? 0 : options.length - 1) : (i + dir + options.length) % options.length;
    onChange(options[nextIndex].value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={legend}
      aria-describedby={describedBy}
      className="flex flex-wrap gap-2"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          move(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          move(-1);
        } else if (e.key === 'Home') {
          e.preventDefault();
          onChange(options[0].value);
        } else if (e.key === 'End') {
          e.preventDefault();
          onChange(options[options.length - 1].value);
        }
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (!value && o === options[0]) ? 0 : -1}
            onClick={() => onChange(allowDeselect && selected ? null : o.value)}
            className={`min-h-[44px] px-4 rounded-xl border text-sm transition-colors ${
              selected
                ? `${o.selectedClass} border-transparent font-semibold`
                : 'bg-surface border-border text-ink hover:bg-surface-sunken'
            }`}
          >
            {selected ? '✓ ' : ''}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
