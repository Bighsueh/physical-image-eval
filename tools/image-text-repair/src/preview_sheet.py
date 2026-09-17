"""Per-region montage of preview.png thumbnails for quick human review."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import FONT_FILES, WORK_DIR  # noqa: E402

THUMB_W = 900
COLS = 2
LABEL_H = 30


def build_region_sheet(region_dir: Path) -> Path | None:
    previews = sorted(region_dir.glob("*/preview.png"))
    if not previews:
        return None
    font = ImageFont.truetype(str(FONT_FILES[400]), 20)
    thumbs = []
    for p in previews:
        im = Image.open(p).convert("RGB")
        scale = THUMB_W / im.width
        thumbs.append((p.parent.name, im.resize((THUMB_W, int(im.height * scale)))))

    cell_h = LABEL_H + max(t.height for _, t in thumbs) + 10
    rows = (len(thumbs) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * (THUMB_W + 10) + 10, rows * cell_h + 10), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (name, thumb) in enumerate(thumbs):
        cx = 10 + (i % COLS) * (THUMB_W + 10)
        cy = 10 + (i // COLS) * cell_h
        draw.text((cx, cy), name, font=font, fill=(20, 20, 20))
        sheet.paste(thumb, (cx, cy + LABEL_H))
    out = region_dir / "region_previews.png"
    sheet.save(out)
    return out


def main() -> None:
    for region_dir in sorted(WORK_DIR.iterdir()):
        if region_dir.is_dir():
            out = build_region_sheet(region_dir)
            if out:
                print(out)


if __name__ == "__main__":
    main()
