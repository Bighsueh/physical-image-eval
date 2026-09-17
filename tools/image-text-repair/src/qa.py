"""QA artifacts: 3-up contact sheet + round-trip OCR comparison."""
from __future__ import annotations

import re
from pathlib import Path

from PIL import Image

from classify import render_text_for
from ocr_vision import ocr_image

_PUNCT = re.compile(r"[\s,。、,.!!??::;;「」『』()()·…~〜-]")


def contact_sheet(original: Image.Image, erased: Image.Image, final: Image.Image, out: Path) -> None:
    scale = 0.5
    w, h = int(original.width * scale), int(original.height * scale)
    panels = [im.resize((w, h)) for im in (original, erased, final)]
    sheet = Image.new("RGB", (w * 3 + 20, h), "white")
    for i, panel in enumerate(panels):
        sheet.paste(panel, (i * (w + 10), 0))
    sheet.save(out)


def _normalize(text: str) -> str:
    return _PUNCT.sub("", text)


def _iou(a: list[float], b: list[float]) -> float:
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    ix = max(0.0, min(ax1, bx1) - max(ax0, bx0))
    iy = max(0.0, min(ay1, by1) - max(ay0, by0))
    inter = ix * iy
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def roundtrip_check(final_png: Path, expected_lines: list[dict]) -> list[dict]:
    """Re-OCR the rendered output and diff each line against its expected text."""
    with Image.open(final_png) as im:
        width, height = im.size
    found = ocr_image(final_png, width, height, language_correction=False)

    mismatches = []
    for exp in expected_lines:
        want = _normalize(exp.get("corrected_text") or exp["render_ocr_text"])
        if not want:
            continue
        best, best_iou = None, 0.0
        for got in found:
            iou = _iou(exp["render_bbox"], got["bbox"])
            if iou > best_iou:
                best, best_iou = got, iou
        got_raw = best["text"] if best and best_iou > 0.2 else ""
        # apply the same badge-prefix strip used at render time, so kept
        # panel numbers (①/1/2…) don't count as mismatches
        got_text = _normalize(render_text_for(got_raw, exp.get("strip_prefix", False)))
        if got_text != want:
            mismatches.append(
                {
                    "id": exp["id"],
                    "expected": exp.get("corrected_text") or exp["render_ocr_text"],
                    "reocr": best["text"] if best and best_iou > 0.2 else "(no line found)",
                    "iou": round(best_iou, 2),
                }
            )
    return mismatches
