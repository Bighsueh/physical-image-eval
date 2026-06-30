import { useAuth } from '../auth/AuthContext';
import { LogoutButton } from '../components/LogoutButton';

/**
 * Reviewer landing — the 0／51 personal progress start (FR-002/FR-003, US1). This is a minimal
 * placeholder OWNED BY FEATURE 003 (the real per-reviewer progress lives there); 001 only needs a
 * reviewer to land here after login. The "0／51" text is the start-of-review signal.
 */
export function ProgressPage() {
  const { account } = useAuth();
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold text-gray-900">我的審查進度</h1>
          <LogoutButton />
        </div>
        {account && <p className="text-gray-600 mb-6">{account.displayName} 你好</p>}
        <p className="text-lg" aria-label="審查進度 0 / 51">
          已完成 <span className="font-bold">0</span>／<span className="font-bold">51</span> 張
        </p>
        <p className="mt-6 text-sm text-gray-500">（逐張審查介面由功能 003 提供）</p>
      </div>
    </main>
  );
}
