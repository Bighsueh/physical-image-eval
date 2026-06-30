import type { OverallJudgement } from '../../api/reviews';
import { Segmented } from './Segmented';

/** 整體判定 — required single-select (FR-010). Inline error rendered by the caller (SubmitBar). */
export function OverallJudgementField({
  value,
  onChange,
  errorId,
}: {
  value: OverallJudgement | null;
  onChange: (v: OverallJudgement | null) => void;
  errorId?: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink mb-2">
        整體判定 <span className="text-accent-deep">必填</span>
      </legend>
      <Segmented<OverallJudgement>
        legend="整體判定"
        describedBy={errorId}
        value={value}
        onChange={onChange}
        options={[
          { value: '通過', label: '通過', selectedClass: 'bg-primary text-white' },
          { value: '需小修', label: '需小修', selectedClass: 'bg-warn text-warn-deep' },
          { value: '需重做', label: '需重做', selectedClass: 'bg-accent text-white' },
        ]}
      />
    </fieldset>
  );
}
