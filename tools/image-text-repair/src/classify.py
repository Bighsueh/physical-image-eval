"""Line classification: scope filter, role assignment, panel mapping, alignment."""
from __future__ import annotations

import re
import unicodedata

HAN_RANGES = ((0x4E00, 0x9FFF), (0x3400, 0x4DBF))
# glyphs that must never be erased or re-rendered (icons drawn as text)
CIRCLED_NUMBERS = re.compile(r"[①-⓿❶-➓]")
SUBTITLE_PREFIX = re.compile(r"^[\s0-9①-⓿❶-➓.、·]+")


def is_han(ch: str) -> bool:
    cp = ord(ch)
    return any(lo <= cp <= hi for lo, hi in HAN_RANGES)


def has_han(text: str) -> bool:
    return any(is_han(ch) for ch in text)


def is_emoji_like(ch: str) -> bool:
    if CIRCLED_NUMBERS.match(ch):
        return True
    return unicodedata.category(ch) in {"So", "Sk", "Cs"} or ord(ch) >= 0x1F000


def erasable_chars(text: str, strip_prefix: bool) -> list[bool]:
    """Per-character flags: which glyphs belong to the replaceable text run.

    Emoji / circled numbers are never erasable. When strip_prefix is set the
    leading digit/space run (panel badge numbers) is excluded as well.
    """
    flags = [not is_emoji_like(ch) and not ch.isspace() for ch in text]
    if strip_prefix:
        m = SUBTITLE_PREFIX.match(text)
        if m and m.end() < len(text):
            for i in range(m.end()):
                flags[i] = False
    return flags


def render_text_for(text: str, strip_prefix: bool) -> str:
    """The string that will be re-rendered (prefix glyphs and emoji dropped)."""
    kept = text
    if strip_prefix:
        m = SUBTITLE_PREFIX.match(kept)
        if m and m.end() < len(kept):
            kept = kept[m.end():]
    return "".join(ch for ch in kept if not is_emoji_like(ch)).strip()


def is_wide_glyph(ch: str) -> bool:
    cp = ord(ch)
    return (
        0x2E80 <= cp <= 0x9FFF
        or 0x3400 <= cp <= 0x4DBF
        or 0xF900 <= cp <= 0xFAFF
        or 0xFF00 <= cp <= 0xFF60
        or 0x3000 <= cp <= 0x303F
    )


def est_text_width(text: str, char_h: float) -> float:
    """Expected rendered width: CJK ≈ one em, halfwidth glyphs ≈ 0.55 em.

    Vision sometimes reports char/line boxes squeezed toward the line centre;
    this estimate recovers the true span from glyph count and line height.
    """
    return sum(1.0 if is_wide_glyph(ch) else 0.55 for ch in text) * char_h


def panel_of(bbox: list[float], width: int, height: int) -> str:
    """Quadrant of the 2x2 grid ('p1'..'p4'), or 'top'/'bottom' margins."""
    cx = bbox[0] + bbox[2] / 2
    cy = bbox[1] + bbox[3] / 2
    if cy < 0.115 * height:
        return "top"
    if cy > 0.92 * height:
        return "bottom"
    row = 0 if cy < 0.52 * height else 1
    col = 0 if cx < width / 2 else 1
    return f"p{row * 2 + col + 1}"


def looks_like_subtitle(text: str, bbox: list[float], height: int) -> bool:
    if re.match(r"^\d+\s+\S", text):
        return True
    return bbox[3] >= 0.038 * height  # tall line (~40px on 1024)


def is_yellow_bg(bg_rgb: tuple[float, float, float]) -> bool:
    """Saturated warm yellow (star badge) vs the pale beige page background."""
    r, g, b = bg_rgb
    return r > 190 and g > 160 and b < 140 and (r - b) > 80


def classify_lines(lines: list[dict], width: int, height: int) -> list[dict]:
    """Assign in_scope / panel / role / strip_prefix to OCR lines (pure)."""
    staged = []
    for ln in lines:
        panel = panel_of(ln["bbox"], width, height)
        in_scope = has_han(ln["text"])
        staged.append({**ln, "panel": panel, "in_scope": in_scope})

    tip_title_y: dict[str, float] = {}
    for ln in staged:
        if ln["in_scope"] and "小提醒" in ln["text"]:
            tip_title_y[ln["panel"]] = min(
                ln["bbox"][1], tip_title_y.get(ln["panel"], float("inf"))
            )

    classified = []
    for ln in staged:
        role = "other"
        strip_prefix = False
        if ln["in_scope"]:
            panel = ln["panel"]
            bg = ln.get("bg_color")
            if panel == "top":
                role = "title"
            elif panel == "bottom":
                role = "banner"
            elif "小提醒" in ln["text"]:
                role = "tip_title"
            elif panel in tip_title_y and ln["bbox"][1] > tip_title_y[panel]:
                role = "tip"
            elif bg is not None and is_yellow_bg(tuple(bg)):
                role = "star"
            elif looks_like_subtitle(ln["text"], ln["bbox"], height):
                role = "subtitle"
                strip_prefix = True
            else:
                role = "body"
        classified.append({**ln, "role": role, "strip_prefix": strip_prefix})
    return classified


def alignment_for(role: str) -> str:
    return "center" if role in {"title", "banner", "star"} else "left"


def assign_ids(lines: list[dict]) -> list[dict]:
    """Stable ids like 'title.L1', 'p2.body.L3' in reading order."""
    counters: dict[str, int] = {}
    out = []
    for ln in lines:
        if not ln["in_scope"]:
            out.append({**ln, "id": None})
            continue
        prefix = ln["role"] if ln["panel"] in {"top", "bottom"} else f"{ln['panel']}.{ln['role']}"
        counters[prefix] = counters.get(prefix, 0) + 1
        out.append({**ln, "id": f"{prefix}.L{counters[prefix]}"})
    return out
