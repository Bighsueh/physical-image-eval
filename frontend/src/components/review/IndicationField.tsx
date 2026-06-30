import type { IndicationJudgement } from '../../api/reviews';
import { Segmented } from './Segmented';

/** 適應症／診斷對應 — optional single-select + optional note (FR-012). Never forces the note. */
export function IndicationField({
  value,
  note,
  onChange,
  onNoteChange,
}: {
  value: IndicationJudgement | null;
  note: string | null;
  onChange: (v: IndicationJudgement | null) => void;
  onNoteChange: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink mb-2">
        適應症／診斷對應 <span className="text-ink-soft font-normal">選填</span>
      </legend>
      <Segmented<IndicationJudgement>
        legend="適應症／診斷對應"
        value={value}
        onChange={onChange}
        allowDeselect
        options={[
          { value: '合理', label: '合理', selectedClass: 'bg-primary text-white' },
          { value: '有疑慮', label: '有疑慮', selectedClass: 'bg-accent text-white' },
        ]}
      />
      <label htmlFor="indicationNote" className="sr-only">
        適應症說明
      </label>
      <textarea
        id="indicationNote"
        value={note ?? ''}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder={value === '有疑慮' ? '可說明疑慮（選填）' : '適應症說明（選填）'}
        rows={2}
        className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </fieldset>
  );
}
