import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

/** 'temp' = system issues a one-time 6-digit password (forced change); 'set' = admin fixes it now. */
export type PasswordMode = 'temp' | 'set';

export const PASSWORD_MIN = 6;

interface PasswordModeFieldsProps {
  mode: PasswordMode;
  onModeChange: (mode: PasswordMode) => void;
  password: string;
  onPasswordChange: (value: string) => void;
}

const inputCls =
  'w-full border border-border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary';

/**
 * Password setup for account creation (2026-07-01 clarification): the admin either lets the system
 * issue a one-time temp password (the original flow, forced change on first login) or sets the
 * password directly here (no forced change). The password field appears only in 'set' mode and has
 * a show/hide toggle (password-toggle UX rule).
 */
export function PasswordModeFields({
  mode,
  onModeChange,
  password,
  onPasswordChange,
}: PasswordModeFieldsProps) {
  const [reveal, setReveal] = useState(false);

  return (
    <fieldset className="mb-4">
      <legend className="block text-sm font-medium text-ink mb-2">密碼設定方式</legend>

      <label className="flex items-start gap-2 mb-2 cursor-pointer">
        <input
          type="radio"
          name="passwordMode"
          checked={mode === 'temp'}
          onChange={() => onModeChange('temp')}
          className="mt-1"
        />
        <span className="text-sm text-ink">
          系統產生一次性臨時密碼
          <span className="block text-xs text-ink-soft">對方首次登入後需自行變更密碼。</span>
        </span>
      </label>

      <label className="flex items-start gap-2 mb-3 cursor-pointer">
        <input
          type="radio"
          name="passwordMode"
          checked={mode === 'set'}
          onChange={() => onModeChange('set')}
          className="mt-1"
        />
        <span className="text-sm text-ink">
          由我直接設定密碼
          <span className="block text-xs text-ink-soft">對方可直接以此密碼登入，不需變更。</span>
        </span>
      </label>

      {mode === 'set' && (
        <div>
          <label htmlFor="setPassword" className="block text-sm font-medium text-ink mb-1">
            密碼（至少 {PASSWORD_MIN} 個字元）
          </label>
          <div className="relative">
            <input
              id="setPassword"
              type={reveal ? 'text' : 'password'}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              minLength={PASSWORD_MIN}
              required
              autoComplete="new-password"
              className={`${inputCls} min-h-[44px] pr-12`}
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? '隱藏密碼' : '顯示密碼'}
              aria-pressed={reveal}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-soft hover:text-ink"
            >
              {reveal ? (
                <EyeOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Eye className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      )}
    </fieldset>
  );
}
