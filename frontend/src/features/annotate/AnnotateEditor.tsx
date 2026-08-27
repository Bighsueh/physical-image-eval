import FilerobotImageEditor, { TABS, TOOLS } from 'react-filerobot-image-editor';
import { useCallback, useEffect, useState } from 'react';
import { getAnnotation, saveAnnotation } from '../../api/review-photos';
import { FILEROBOT_ZH_TW } from './filerobot-zh-TW';
import type { AnnotateModalProps } from './AnnotateModal.lazy';

/**
 * In-app annotation. Optional by design: a reviewer who never presses 「標註」 experiences the
 * exact flow that existed before this feature (FR-053).
 *
 * Three configuration choices carry the design:
 *
 *  - **The original is what gets loaded**, not the display derivative, so the saved annotation
 *    comes out at full resolution (FR-056). The editor separates preview resolution from save
 *    resolution, so this costs nothing in interaction smoothness on a phone.
 *  - **`useBackendTranslations: false`** — the default would fetch strings from the vendor at
 *    runtime, which an internal clinical tool must not do (FR-055).
 *  - **`loadableDesignState`** restores the previous annotation, which is what makes it
 *    editable rather than a one-shot flattening.
 *
 * Mobile uses the library's own layout: a hand-rolled toolbar would be a permanent maintenance
 * cost for a cosmetic difference.
 */

/** Lowered for interaction; the save ratio is what determines output resolution. */
const PREVIEW_PIXEL_RATIO = 1;
const SAVE_PIXEL_RATIO = 4;
/** Fallback when a constrained device cannot render the full-resolution export. */
const DEGRADED_SAVE_PIXEL_RATIO = 1;

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();

export function AnnotateEditor({ blueprintId, photo, onClose, onSaved }: AnnotateModalProps) {
  const [loadedState, setLoadedState] = useState<object | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [savePixelRatio, setSavePixelRatio] = useState(SAVE_PIXEL_RATIO);

  useEffect(() => {
    let cancelled = false;
    getAnnotation(blueprintId, photo.id)
      .then((r) => {
        if (cancelled) return;
        setLoadedState((r.annotationState as object) ?? null);
      })
      .catch(() => setLoadedState(null))
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [blueprintId, photo.id]);

  const onSave = useCallback(
    async (edited: { imageBase64?: string }, designState: unknown) => {
      if (!edited.imageBase64) return;
      try {
        const blob = await dataUrlToBlob(edited.imageBase64);
        const { photo: saved } = await saveAnnotation(
          blueprintId,
          photo.id,
          blob,
          designState ?? {},
        );
        onSaved(saved);
      } catch {
        // A full-resolution export can exhaust memory on a constrained device. Drop the ratio
        // and let the reviewer save again — the annotation content itself is never at risk,
        // and a desktop session can re-export at full size later (research D17).
        if (savePixelRatio !== DEGRADED_SAVE_PIXEL_RATIO) {
          setSavePixelRatio(DEGRADED_SAVE_PIXEL_RATIO);
          setNotice('這台裝置無法輸出原尺寸，已改用較小尺寸，請再按一次儲存。標註內容不會遺失。');
        } else {
          setNotice('儲存失敗，請檢查連線後再試一次。');
        }
      }
    },
    [blueprintId, photo.id, onSaved, savePixelRatio],
  );

  if (!ready) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 text-sm text-white"
      >
        載入先前的標註⋯
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/90" role="dialog" aria-modal="true" aria-label="標註照片">
      {notice && (
        <p
          role="alert"
          className="absolute inset-x-0 top-0 z-10 bg-warn-tint px-4 py-2 text-center text-sm text-warn-deep"
        >
          {notice}
        </p>
      )}
      <FilerobotImageEditor
        source={photo.urls.original}
        onSave={onSave}
        onClose={onClose}
        loadableDesignState={loadedState ?? undefined}
        useBackendTranslations={false}
        language="zh-TW"
        translations={FILEROBOT_ZH_TW}
        previewPixelRatio={PREVIEW_PIXEL_RATIO}
        savingPixelRatio={savePixelRatio}
        defaultTabId={TABS.ANNOTATE}
        defaultToolId={TOOLS.ARROW}
        tabsIds={[TABS.ANNOTATE, TABS.ADJUST]}
        annotationsCommon={{ fill: '#E0483C', stroke: '#E0483C', strokeWidth: 6 }}
        Rotate={{ angle: 90, componentType: 'buttons' }}
      />
    </div>
  );
}
