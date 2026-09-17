"""Re-render corrected text with LXGW WenKai TC onto the erased canvas.

Sizing strategy: lines are grouped by (role, weight) and clustered by height
(±12%) so OCR height wobble doesn't cause visible size jitter, while genuinely
smaller annotations (clock captions) keep their own cluster. Each cluster gets
ONE font size: the largest that fits every member line's available width.

Obstacle awareness: text often sits inside a drawn container (rounded pill,
tip box) or next to icons. After erasing we scan the canvas along each line's
horizontal band for the nearest non-background columns on either side; those
become hard limits the rendered text must not cross.
"""
from __future__ import annotations

import statistics
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from classify import est_text_width
from config import FONT_FILES

HEIGHT_RATIO = 0.95      # rendered em height vs original line height
MAX_SHRINK = 0.18        # deepest cluster-wide shrink below the height-fit size
EMERGENCY_SHRINK = 0.30  # per-line extra shrink allowed to stay inside obstacles
OVERFLOW_GRACE = 1.03    # tolerated overshoot before raising the overflow flag
CLUSTER_TOL = 0.15       # lines within ±15% height belong to one size cluster
LEFT_AVAIL_CAP = 1.12    # left-aligned text may exceed its original run by 12%
REFERENCE_GLYPH = "永"   # stable CJK em box for size calibration

OBSTACLE_DIST = 45.0     # colour distance from line bg that counts as obstacle
OBSTACLE_FRAC = 0.35     # fraction of band pixels in a column to call it one
OBSTACLE_MARGIN = 5      # px kept clear between text and an obstacle
SCAN_REACH = 2.5         # how many line-heights to scan beyond the original run

# fullwidth punctuation occupies a whole em in LXGW WenKai but is visually
# mostly whitespace — its advance may be squeezed down to 50% to fit lines
SQUEEZABLE = set("，。、！？：；（）〈〉《》「」『』～·・｜＝　 ")
PUNCT_SQUEEZE_MIN = 0.5
# where the ink sits inside the em box decides which side the squeeze removes:
# opening brackets carry ink on the right (pull the glyph left), centred marks
# carry it in the middle (split the reduction); everything else is ink-left
SQUEEZE_INK_RIGHT = set("（〈《「『【〔")
SQUEEZE_INK_CENTER = set("～·・｜＝　 ")


@lru_cache(maxsize=256)
def _font(weight: int, size: int) -> ImageFont.FreeTypeFont:
    path = FONT_FILES[weight]
    if not path.is_file():
        raise SystemExit(f"font file missing: {path} (download fonts first)")
    return ImageFont.truetype(str(path), size)


@lru_cache(maxsize=256)
def _size_for_height(weight: int, target_h: int) -> int:
    """Largest point size whose 「永」 glyph height fits HEIGHT_RATIO * target_h."""
    goal = HEIGHT_RATIO * target_h
    lo, hi = 4, max(8, target_h * 2)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        bbox = _font(weight, mid).getbbox(REFERENCE_GLYPH)
        if (bbox[3] - bbox[1]) <= goal:
            lo = mid
        else:
            hi = mid - 1
    return lo


def _text_of(line: dict) -> str:
    return (line.get("corrected_text") or line["render_ocr_text"]).strip()


def _obstacle_limits(canvas: np.ndarray, line: dict) -> tuple[float, float]:
    """Nearest non-background columns left/right of the original text run."""
    height, width = canvas.shape[:2]
    x, y, w, h = line["render_bbox"]
    band_top = max(0, int(y + 0.25 * h))
    band_bot = min(height, max(band_top + 1, int(y + 0.75 * h)))
    bg = np.asarray(line["bg_color"], dtype=np.float32)
    reach = int(SCAN_REACH * h)

    def first_obstacle(cols: range) -> int | None:
        """Returns the first obstacle column (single column suffices —
        rounded-box borders are often only 1-2px wide)."""
        for cx in cols:
            band = canvas[band_top:band_bot, cx].astype(np.float32)
            frac = float(
                (np.linalg.norm(band - bg[None, :], axis=1) > OBSTACLE_DIST).mean()
            )
            if frac > OBSTACLE_FRAC:
                return cx
        return None

    # right scan also starts INSIDE the trailing edge: a trailing icon (e.g.
    # a ❤ OCR read as a letter) can live inside the union span too
    right_from = max(int(x), min(width - 1, int(x + w - min(0.6 * h, w / 2))))
    right_to = min(width, int(x + w) + reach)
    hit = first_obstacle(range(right_from, right_to))
    right_limit = (hit - 1 - OBSTACLE_MARGIN) if hit is not None else float(right_to)
    # distrust a "blocked" verdict deeper than icon-depth into the run
    if right_limit < x + w - 1.5 * h:
        right_limit = x + w

    # left scan starts INSIDE the leading edge of the run: OCR sometimes
    # merges a leading icon (💡/❤) into the first char box, so the union's
    # left edge is not automatically safe territory
    left_from = min(width - 1, int(x + min(0.6 * h, w / 2)))
    left_to = max(0, left_from - reach)
    hit = first_obstacle(range(left_from, left_to, -1))
    left_limit = (hit + 1 + OBSTACLE_MARGIN) if hit is not None else float(left_to)
    # distrust a "blocked" verdict deeper than icon-depth into the run
    if left_limit > x + 1.5 * h:
        left_limit = x

    return left_limit, right_limit


def _avail_for(line: dict) -> float:
    x, _y, w, h = line["render_bbox"]
    # trust the wider of the reported box and the glyph-count estimate —
    # Vision under-reports the span of some lines (squeezed char boxes)
    w = max(w, est_text_width(line["render_ocr_text"], h))
    avail = float(line.get("avail_width") or w * 1.1)
    if line["align"] != "center":
        avail = min(avail, w * LEFT_AVAIL_CAP)
    # widen when corrected text legitimately gained glyphs OCR missed
    ocr_len = max(1, len(line["render_ocr_text"]))
    text = _text_of(line)
    if len(text) > ocr_len:
        avail *= min(len(text) / ocr_len, 1.3)
    # obstacle span (frame lines, icons) is a hard ceiling
    span = line.get("_span")
    if span is not None:
        avail = min(avail, span)
    return avail


def _fitted_advances(
    draw: ImageDraw.ImageDraw, text: str, weight: int, size: int, avail: float
) -> tuple[list[tuple[float, float]], float]:
    """Per-char (advance, draw_offset) at `size`, squeezing punctuation to fit.

    draw_offset shifts the glyph's paint position relative to the cursor so
    the squeeze removes the empty side of the em box, not the inked side.
    """
    font = _font(weight, size)
    natural_adv = [draw.textlength(ch, font=font) for ch in text]
    natural = sum(natural_adv)
    factor = 0.0
    if natural > avail:
        squeeze_room = sum(
            a * (1 - PUNCT_SQUEEZE_MIN)
            for ch, a in zip(text, natural_adv)
            if ch in SQUEEZABLE
        )
        reduction = min(natural - avail, squeeze_room)
        if squeeze_room > 0 and reduction > 0:
            factor = reduction / squeeze_room * (1 - PUNCT_SQUEEZE_MIN)

    result: list[tuple[float, float]] = []
    total = 0.0
    for ch, nat in zip(text, natural_adv):
        if factor and ch in SQUEEZABLE:
            adv = nat * (1 - factor)
            cut = nat - adv
            if ch in SQUEEZE_INK_RIGHT:
                offset = -cut
            elif ch in SQUEEZE_INK_CENTER:
                offset = -cut / 2
            else:
                offset = 0.0
        else:
            adv, offset = nat, 0.0
        result.append((adv, offset))
        total += adv
    return result, total


def _resolve_vertical_overlaps(lines: list[dict]) -> list[dict]:
    """Split overlapping stacked line boxes at the midpoint of the overlap.

    Vision inflates char-box heights to the whole line box (e.g. when a badge
    shares the line), so consecutive lines can report overlapping boxes; drawn
    at those heights the glyphs collide.
    """
    out = [dict(ln) for ln in sorted(lines, key=lambda l: l["render_bbox"][1])]
    for i, a in enumerate(out):
        ax, ay, aw, ah = a["render_bbox"]
        for b in out[i + 1:]:
            bx, by, bw, bh = b["render_bbox"]
            if by >= ay + ah:
                continue
            x_overlap = min(ax + aw, bx + bw) - max(ax, bx)
            if x_overlap < 0.3 * min(aw, bw):
                continue
            boundary = (by + ay + ah) / 2
            new_ah = max(8.0, boundary - 1 - ay)
            new_bh = max(8.0, by + bh - boundary - 1)
            a["render_bbox"] = [ax, ay, aw, new_ah]
            b["render_bbox"] = [bx, boundary + 1, bw, new_bh]
            ax, ay, aw, ah = a["render_bbox"]
    return out


def _cluster_by_height(lines: list[dict]) -> list[list[dict]]:
    """Group same-(role,weight) lines into height clusters within ±CLUSTER_TOL."""
    groups: dict[tuple, list[dict]] = {}
    for line in lines:
        groups.setdefault((line["role"], line["weight"]), []).append(line)

    clusters: list[list[dict]] = []
    for members in groups.values():
        members = sorted(members, key=lambda ln: ln["render_bbox"][3])
        current: list[dict] = []
        for line in members:
            if current:
                med = statistics.median(m["render_bbox"][3] for m in current)
                if abs(line["render_bbox"][3] - med) > CLUSTER_TOL * med:
                    clusters.append(current)
                    current = []
            current.append(line)
        if current:
            clusters.append(current)
    return clusters


def _cluster_size(draw: ImageDraw.ImageDraw, cluster: list[dict]) -> int:
    """One size for the whole cluster: height-fit, shrunk until every line fits."""
    weight = cluster[0]["weight"]
    med_h = statistics.median(ln["render_bbox"][3] for ln in cluster)
    # cap at the smallest member's height (+8%) so upsizing a genuinely
    # shorter line can't make it collide with the row above/below
    min_h = min(ln["render_bbox"][3] for ln in cluster)
    base = _size_for_height(weight, int(round(min(med_h, min_h * 1.08))))
    floor = max(4, int(base * (1 - MAX_SHRINK)))
    size = base
    for line in cluster:
        text = _text_of(line)
        if not text:
            continue
        avail = _avail_for(line)
        s = size
        while s > floor and _fitted_advances(draw, text, weight, s, avail)[1] > avail:
            s -= 1
        size = min(size, s)
    return size


def _draw_line(
    draw: ImageDraw.ImageDraw, line: dict, size: int
) -> list[str]:
    text = _text_of(line)
    if not text:
        return []
    weight = line["weight"]
    x, y, w, h = line["render_bbox"]
    avail = _avail_for(line)
    advances, total_w = _fitted_advances(draw, text, weight, size, avail)

    # hard obstacle span: if the cluster size still crosses a frame line or
    # icon, this single line may shrink further (uniformity < containment)
    left_limit = line.get("_left", x)
    right_limit = line.get("_right", x + w)
    start_x = max(x, left_limit)
    hard_span = right_limit - (start_x if line["align"] != "center" else left_limit)
    emergency_floor = max(4, int(size * (1 - EMERGENCY_SHRINK)))
    while total_w > hard_span and size > emergency_floor:
        size -= 1
        advances, total_w = _fitted_advances(draw, text, weight, size, avail)

    flags = ["overflow"] if total_w > min(avail, hard_span) * OVERFLOW_GRACE else []
    color = tuple(int(round(c)) for c in line["stroke_color"])
    font = _font(weight, size)
    y_mid = y + h / 2
    if line["align"] == "center":
        center = x + w / 2
        center = max(center, left_limit + total_w / 2)
        center = min(center, right_limit - total_w / 2)
        cursor = center - total_w / 2
    else:
        cursor = start_x
    for ch, (adv, offset) in zip(text, advances):
        draw.text((cursor + offset, y_mid), ch, font=font, fill=color, anchor="lm")
        cursor += adv
    return flags


def render_image(erased: Image.Image, lines: list[dict]) -> tuple[Image.Image, dict]:
    """Render all lines onto a copy of the erased canvas; collect flags."""
    canvas = erased.copy()
    draw = ImageDraw.Draw(canvas)
    erased_np = np.asarray(erased.convert("RGB"))

    prepared = []
    for line in _resolve_vertical_overlaps(lines):
        left, right = _obstacle_limits(erased_np, line)
        x, _y, w, _h = line["render_bbox"]
        span = right - (max(x, left) if line["align"] != "center" else left)
        prepared.append({**line, "_left": left, "_right": right, "_span": span})

    raised: dict[str, list[str]] = {}
    for cluster in _cluster_by_height(prepared):
        size = _cluster_size(draw, cluster)
        for line in cluster:
            flags = _draw_line(draw, line, size)
            if flags:
                raised[line["id"]] = flags
    return canvas, raised
