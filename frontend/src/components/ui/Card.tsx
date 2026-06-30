import type { HTMLAttributes, ReactNode } from 'react';

/** Warm surface card. tone="risk" adds a terracotta left rule + tint for high-risk items.
 * Forwards extra div props (id, data-*, etc.) so callers can anchor tours/tests to it. */
export function Card({
  tone = 'default',
  className = '',
  children,
  ...rest
}: {
  tone?: 'default' | 'risk';
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  const risk = tone === 'risk' ? 'border-l-4 border-l-accent bg-accent-tint/40' : '';
  return (
    <div {...rest} className={`bg-surface border border-border rounded-2xl shadow-soft ${risk} ${className}`}>
      {children}
    </div>
  );
}
