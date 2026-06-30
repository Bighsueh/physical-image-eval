import type { ReactNode } from 'react';
import { LogoutButton } from '../LogoutButton';

/**
 * Green brand banner header for protected pages (the reviewed images' title-banner motif).
 * Brush-style brand title (LXGW WenKai TC), optional right-side slot, and a logout control.
 */
export function AppHeader({
  title = '運動衛教圖審查',
  userName,
  right,
}: {
  title?: string;
  userName?: string;
  right?: ReactNode;
}) {
  return (
    <header className="bg-primary text-white shadow-soft">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <h1 className="font-brand text-xl font-bold tracking-wide">{title}</h1>
        <div className="flex items-center gap-4 text-sm">
          {right}
          {userName && <span className="text-white/90">{userName}</span>}
          <LogoutButton className="text-sm text-white/90 hover:text-white underline" />
        </div>
      </div>
    </header>
  );
}
