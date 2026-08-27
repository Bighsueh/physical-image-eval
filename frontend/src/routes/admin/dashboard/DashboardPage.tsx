import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getImages,
  getOverview,
  getReviewers,
  type ImageFilters as Filters,
} from '../../../api/admin-dashboard';
import { CompletionSummary } from '../../../components/admin/dashboard/CompletionSummary';
import { StorageUsagePanel } from '../../../components/admin/dashboard/StorageUsagePanel';
import { ExportButton } from '../../../components/admin/dashboard/ExportButton';
import { ImageCoverageTable } from '../../../components/admin/dashboard/ImageCoverageTable';
import { ImageFilters } from '../../../components/admin/dashboard/ImageFilters';
import { ReviewerProgressTable } from '../../../components/admin/dashboard/ReviewerProgressTable';
import { AppHeader } from '../../../components/ui';

/** Admin dashboard (US1–US3): overview + per-image coverage (filterable, exportable) + reviewers. */
export function DashboardPage() {
  const [filters, setFilters] = useState<Filters>({});
  const overview = useQuery({ queryKey: ['admin-overview'], queryFn: getOverview });
  const reviewers = useQuery({ queryKey: ['admin-reviewers'], queryFn: getReviewers });
  const images = useQuery({ queryKey: ['admin-images', filters], queryFn: () => getImages(filters) });

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader
        title="審查儀表板"
        right={
          <Link to="/admin/accounts" className="text-white/90 hover:text-white underline">
            帳號管理
          </Link>
        }
      />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section className="space-y-3">
          <h2 className="text-2xl font-bold text-ink">整體進度</h2>
          {overview.data && <CompletionSummary data={overview.data} />}
          {/* Capacity is close enough to plausible usage that it must be visible before it bites. */}
          <StorageUsagePanel />
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold text-ink">各圖覆蓋與判定</h2>
            <ExportButton filters={filters} />
          </div>
          <ImageFilters value={filters} onChange={setFilters} />
          {images.isLoading && <p className="text-ink-soft">載入中…</p>}
          {images.data && <ImageCoverageTable rows={images.data.rows} />}
          {images.data && (
            <p className="text-xs text-ink-soft nums">
              顯示 {images.data.rows.length}／{overview.data?.totalBlueprints ?? images.data.rows.length} 張
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold text-ink">各審查者進度</h2>
          {reviewers.data && <ReviewerProgressTable rows={reviewers.data.rows} />}
        </section>
      </main>
    </div>
  );
}
