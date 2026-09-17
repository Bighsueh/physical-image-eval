"""Build per-image flags_sheet.png: labeled montage of flagged-line crops."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import FONT_FILES, WORK_DIR  # noqa: E402

SHEET_W = 760
LABEL_H = 26
GAP = 10


def build_sheet(image_work_dir: Path) -> Path | None:
    spec = json.loads((image_work_dir / "spec.json").read_text(encoding="utf-8"))
    flagged = [
        ln
        for ln in spec["lines"]
        if ln.get("in_scope") and (ln.get("flags") or ln.get("alt_text"))
    ]
    if not flagged:
        return None

    font = ImageFont.truetype(str(FONT_FILES[400]), 17)
    entries = []
    total_h = GAP
    for ln in flagged:
        crop_path = image_work_dir / "crops" / f"{ln['id']}.png"
        if not crop_path.is_file():
            continue
        crop = Image.open(crop_path).convert("RGB")
        scale = min(1.5, (SHEET_W - 20) / crop.width)
        crop = crop.resize((int(crop.width * scale), int(crop.height * scale)))
        entries.append((ln, crop))
        total_h += LABEL_H + crop.height + GAP

    if not entries:
        return None
    sheet = Image.new("RGB", (SHEET_W, total_h), "white")
    draw = ImageDraw.Draw(sheet)
    y = GAP
    for ln, crop in entries:
        label = f"{ln['id']}  conf={ln['confidence']:.2f}  OCR:「{ln['render_ocr_text']}」"
        if ln.get("alt_text"):
            label += f"  alt:「{ln['alt_text']}」"
        draw.text((10, y), label, font=font, fill=(180, 30, 30))
        sheet.paste(crop, (10, y + LABEL_H))
        y += LABEL_H + crop.height + GAP
    out = image_work_dir / "flags_sheet.png"
    sheet.save(out)
    return out


def main() -> None:
    count = 0
    for spec_path in sorted(WORK_DIR.glob("*/*/spec.json")):
        out = build_sheet(spec_path.parent)
        if out:
            count += 1
    print(f"flag sheets written: {count}")


if __name__ == "__main__":
    main()
