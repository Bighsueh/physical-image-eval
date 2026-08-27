/**
 * Test stub for `react-filerobot-image-editor`.
 *
 * The real component brings Konva and a canvas renderer — neither works in jsdom, and
 * transforming them stalls the module graph for minutes. What the tests need to verify is OUR
 * side of the boundary: that the editor is configured correctly, that a save round-trips
 * through our API, and that a failed full-resolution export degrades rather than loses work.
 * So the stub exposes the props it was given and lets a test fire `onSave` / `onClose`.
 */
export const TABS = { ANNOTATE: 'Annotate', ADJUST: 'Adjust' } as const;
export const TOOLS = { ARROW: 'Arrow', ELLIPSE: 'Ellipse', TEXT: 'Text', PEN: 'Pen' } as const;

export interface StubProps {
  source?: string;
  onSave?: (edited: { imageBase64?: string }, designState: unknown) => void;
  onClose?: () => void;
  useBackendTranslations?: boolean;
  savingPixelRatio?: number;
  previewPixelRatio?: number;
  loadableDesignState?: unknown;
  translations?: Record<string, string>;
}

export default function FilerobotImageEditorStub(props: StubProps) {
  return (
    <div
      data-testid="filerobot-stub"
      data-source={props.source}
      data-backend-translations={String(props.useBackendTranslations)}
      data-saving-ratio={String(props.savingPixelRatio)}
      data-preview-ratio={String(props.previewPixelRatio)}
      data-loaded-state={JSON.stringify(props.loadableDesignState ?? null)}
    >
      <button
        type="button"
        onClick={() => props.onSave?.({ imageBase64: 'data:image/png;base64,iVBORw0KGgo=' }, { arrow: 1 })}
      >
        stub-save
      </button>
      <button type="button" onClick={() => props.onClose?.()}>
        stub-close
      </button>
    </div>
  );
}
