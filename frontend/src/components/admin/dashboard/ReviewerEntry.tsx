import { Download } from 'lucide-react';
import type { AdminPhotoRef, WorkTableEntry } from '../../../api/admin-dashboard';

/**
 * One reviewer's finding on one panel: judgement, problem annotations, and the photos they
 * attached to that panel — kept together, because the note and the photo only make sense read
 * as one statement.
 */
function PhotoTile({ photo }: { photo: AdminPhotoRef }) {
  const src = photo.urls.annotated ?? photo.urls.display;
  return (
    <figure className="m-0 w-[92px] flex flex-col gap-1">
      <a
        href={photo.urls.original}
        target="_blank"
        rel="noreferrer"
        className="block h-[92px] rounded-lg overflow-hidden border border-border bg-surface-sunken"
        aria-label={`開啟原始照片${photo.caption ? `：${photo.caption}` : ''}`}
      >
        <img
          src={src}
          alt={photo.caption ?? '參考照片'}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </a>
      {photo.caption && (
        <figcaption className="truncate text-[11px] text-ink-soft" title={photo.caption}>
          {photo.caption}
        </figcaption>
      )}
    </figure>
  );
}

export function ReviewerEntryRow({ entry }: { entry: WorkTableEntry }) {
  return (
    <div className="border-b border-border px-3 py-2.5 last:border-b-0 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-ink">{entry.reviewerDisplayName}</span>
        {!entry.isActive && (
          <span className="rounded-full border border-border bg-surface-sunken px-2 text-[11px] text-ink-soft">
            非在職
          </span>
        )}
        {entry.problemTypes.map((p) => (
          <span
            key={p}
            className="rounded-full border border-accent bg-accent-tint px-2 text-[11px] text-accent-deep"
          >
            {p}
          </span>
        ))}
        {entry.requiredWarnings.map((w) => (
          <span
            key={w}
            className="rounded-full border border-warn bg-warn-tint px-2 text-[11px] text-warn-deep"
          >
            {w}
          </span>
        ))}
        {entry.overallJudgement && (
          <span className="rounded-full border border-border bg-surface-sunken px-2 text-[11px] text-ink-soft">
            {entry.overallJudgement}
          </span>
        )}
        {entry.submittedAt && (
          <span className="ml-auto text-[11px] text-ink-soft nums">
            {entry.submittedAt.slice(0, 16).replace('T', ' ')}
          </span>
        )}
      </div>

      {entry.problemNote && (
        <p className="m-0 border-l-[3px] border-wood pl-2.5 text-sm text-ink">{entry.problemNote}</p>
      )}
      {entry.warningOther && (
        <p className="m-0 border-l-[3px] border-warn pl-2.5 text-sm text-ink">
          警語補充：{entry.warningOther}
        </p>
      )}

      {entry.photos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5">
          {entry.photos.map((photo) => (
            <PhotoTile key={photo.photoId} photo={photo} />
          ))}
          <a
            href={entry.photos[0].urls.original}
            download
            className="inline-flex items-center gap-1 self-center rounded-xl border border-border bg-surface px-2.5 py-1 text-xs text-primary-deep hover:bg-surface-sunken"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            下載原始照片
          </a>
        </div>
      )}
    </div>
  );
}
