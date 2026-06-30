import { PartyPopper } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card } from '../ui';

/** 51/51 completion — NOT a dead end (FR-029): offers review/revise entry points. */
export function CompletionState({ total }: { total: number }) {
  return (
    <Card className="p-8 max-w-xl mx-auto text-center">
      <PartyPopper className="w-10 h-10 mx-auto text-primary" aria-hidden="true" />
      <h2 className="mt-3 text-xl font-bold text-ink">
        全部審查完成（{total}／{total}）
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        你已提交所有 {total} 張圖的審查。仍可回到進度頁挑任一張重新檢視或修訂。
      </p>
      <div className="mt-5 flex justify-center gap-3">
        <Link to="/progress">
          <Button>回到進度頁</Button>
        </Link>
      </div>
    </Card>
  );
}
