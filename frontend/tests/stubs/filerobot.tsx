/**
 * Test stub for `react-filerobot-image-editor`.
 *
 * The real component brings Konva and a canvas renderer — neither of which works in jsdom, and
 * transforming them stalls the module graph for minutes. What the tests actually need to verify
 * is our side of the boundary: that the editor is NOT loaded until 「標註」 is pressed, and that
 * a save round-trips through our API. This stub stands in for the rendering.
 */
export const TABS = { ANNOTATE: 'Annotate', ADJUST: 'Adjust' } as const;
export const TOOLS = { ARROW: 'Arrow', ELLIPSE: 'Ellipse', TEXT: 'Text', PEN: 'Pen' } as const;

export default function FilerobotImageEditorStub(props: { source?: string }) {
  return <div data-testid="filerobot-stub" data-source={props.source} />;
}
