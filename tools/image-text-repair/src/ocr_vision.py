"""Apple Vision OCR wrapper: line-level text + per-character pixel boxes.

Vision reports normalized rects with a bottom-left origin; everything returned
from here is converted to pixel coords with a top-left origin.
"""
from __future__ import annotations

from pathlib import Path

import Vision
from Foundation import NSURL, NSMakeRange


def _norm_rect_to_px(rect, width: int, height: int) -> list[float]:
    x = rect.origin.x * width
    w = rect.size.width * width
    h = rect.size.height * height
    y = (1.0 - rect.origin.y - rect.size.height) * height
    return [x, y, w, h]


def _utf16_len(ch: str) -> int:
    return len(ch.encode("utf-16-le")) // 2


def ocr_image(
    path: Path,
    width: int,
    height: int,
    language_correction: bool = False,
) -> list[dict]:
    """Run VNRecognizeTextRequest on a PNG; return line dicts with char boxes."""
    url = NSURL.fileURLWithPath_(str(path))
    handler = Vision.VNImageRequestHandler.alloc().initWithURL_options_(url, None)
    request = Vision.VNRecognizeTextRequest.alloc().init()
    request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    request.setRecognitionLanguages_(["zh-Hant", "en-US"])
    request.setUsesLanguageCorrection_(language_correction)

    ok, error = handler.performRequests_error_([request], None)
    if not ok:
        raise RuntimeError(f"Vision OCR failed for {path}: {error}")

    lines: list[dict] = []
    for obs in request.results() or []:
        candidates = obs.topCandidates_(1)
        if not candidates:
            continue
        top = candidates[0]
        text = str(top.string())
        if not text.strip():
            continue

        chars: list[dict] = []
        utf16_pos = 0
        for ch in text:
            ch_len = _utf16_len(ch)
            box_px = None
            rect_obs, _err = top.boundingBoxForRange_error_(
                NSMakeRange(utf16_pos, ch_len), None
            )
            if rect_obs is not None:
                box_px = _norm_rect_to_px(rect_obs.boundingBox(), width, height)
            chars.append({"ch": ch, "bbox": box_px})
            utf16_pos += ch_len

        lines.append(
            {
                "text": text,
                "confidence": float(top.confidence()),
                "bbox": _norm_rect_to_px(obs.boundingBox(), width, height),
                "chars": chars,
            }
        )

    # top-to-bottom, then left-to-right
    return sorted(lines, key=lambda ln: (ln["bbox"][1], ln["bbox"][0]))
