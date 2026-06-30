import type { ReactNode } from 'react';

/** Warm surface card. tone="risk" adds a terracotta left rule + tint for high-risk items. */
export function Card({
  tone = 'default',
  className = '',
  children,
}: {
  tone?: 'default' | 'risk';
  className?: string;
  children: ReactNode;
}) {
  const risk = tone === 'risk' ? 'border-l-4 border-l-accent bg-accent-tint/40' : '';
  return (
    <div className={`bg-surface border border-border rounded-2xl shadow-soft ${risk} ${className}`}>
      {children}
    </div>
  );
}
