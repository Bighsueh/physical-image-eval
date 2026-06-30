import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Design-system button. One primary CTA per screen; danger for destructive actions. min 44px. */
type Variant = 'primary' | 'secondary' | 'danger';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-deep',
  secondary: 'bg-surface text-ink border border-border hover:bg-surface-sunken',
  danger: 'bg-accent text-white hover:bg-accent-deep',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${className}`}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
