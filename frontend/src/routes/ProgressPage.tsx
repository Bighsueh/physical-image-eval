import { useAuth } from '../auth/AuthContext';
import { AppHeader, Card, ProgressBar } from '../components/ui';

/**
 * Reviewer landing — the 0／51 personal progress start (FR-002/FR-003, US1). Minimal placeholder
 * OWNED BY FEATURE 003; the per-reviewer region grid + review cards land there. The "0／51" readout
 * is the start-of-review signal. Styled to the design system so 003 extends it consistently.
 */
export function ProgressPage() {
  const { account } = useAuth();
  return (
    <div className="min-h-screen bg-paper">
      <AppHeader userName={account ? `${account.displayName} 你好` : undefined} />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold text-ink mb-6">我的審查進度</h2>
        <Card className="p-6 max-w-2xl">
          <ProgressBar value={0} total={51} label="完成度" />
          <p className="mt-6 text-sm text-ink-soft">逐張審查介面（依 8 個解剖區域）由功能 003 提供。</p>
        </Card>
      </main>
    </div>
  );
}
