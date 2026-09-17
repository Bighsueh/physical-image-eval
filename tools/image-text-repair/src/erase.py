"""Stroke-level text erasure: char-box mask + background-distance threshold + inpaint."""
from __future__ import annotations

import cv2
import numpy as np

from classify import erasable_chars, est_text_width

MASK_DILATE_PX = 2
BUSY_BG_STD = 18.0      # ring-color stddev above this = busy background
FLAT_BG_STD = 12.0      # below this the background is uniform enough to
                        # flat-fill (no inpaint colour bleeding possible)
ICON_COLOR_DIST = 60.0  # colour distance used by expansion scans
ICON_OFF_AXIS = 40.0    # distance from the stroke↔bg colour axis beyond which
                        # a component is a coloured icon (faded glyphs sit ON
                        # the axis; bulbs/hearts/stars sit far off it)


def off_axis_distance(
    colors: np.ndarray, stroke: np.ndarray, bg: np.ndarray
) -> np.ndarray:
    """Distance of colours from the stroke↔bg interpolation segment.

    A glyph pixel — full ink or faded/anti-aliased — interpolates between the
    stroke and background colours, so it lies near the segment; coloured icon
    pixels do not.
    """
    seg = bg.astype(np.float32) - stroke.astype(np.float32)
    denom = float(seg @ seg)
    flat = colors.reshape(-1, 3).astype(np.float32)
    if denom < 1e-6:
        return np.linalg.norm(flat - stroke[None, :], axis=1).reshape(colors.shape[:-1])
    t = np.clip((flat - stroke[None, :]) @ seg / denom, 0.0, 1.0)
    proj = stroke[None, :] + t[:, None] * seg[None, :]
    return np.linalg.norm(flat - proj, axis=1).reshape(colors.shape[:-1])


def char_union(line: dict) -> list[float]:
    """Unpadded union bbox of erasable char boxes (falls back to line bbox)."""
    flags = erasable_chars(line["text"], line["strip_prefix"])
    boxes = [
        c["bbox"]
        for c, keep in zip(line["chars"], flags)
        if keep and c["bbox"] is not None
    ]
    if not boxes:
        boxes = [line["bbox"]]
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[0] + b[2] for b in boxes)
    y1 = max(b[1] + b[3] for b in boxes)
    return [x0, y0, x1 - x0, y1 - y0]


def _quick_colors(img: np.ndarray, line: dict) -> tuple[np.ndarray, np.ndarray]:
    """Rough bg / stroke colour from char-box pixels (for expansion scans)."""
    samples = []
    for c in line["chars"]:
        if c["bbox"] is None:
            continue
        bx, by, bw, bh = (int(v) for v in c["bbox"])
        sub = img[max(0, by):by + bh, max(0, bx):bx + bw]
        if sub.size:
            samples.append(sub.reshape(-1, 3).astype(np.float32))
    if not samples:
        return np.array([245.0, 240.0, 230.0]), np.array([50.0, 50.0, 50.0])
    pix = np.concatenate(samples)
    bg = np.median(pix, axis=0)
    ink = pix[np.linalg.norm(pix - bg[None, :], axis=1) > ICON_COLOR_DIST]
    stroke = np.median(ink, axis=0) if ink.size else bg
    return bg, stroke


def _scan_expand(
    img: np.ndarray, rows: tuple[int, int], x_start: float, budget: int,
    direction: int, bg: np.ndarray, stroke: np.ndarray,
) -> float:
    """Extend x while columns look like background or text ink; stop at
    anything else (frame lines, star outlines, illustrations)."""
    x = int(x_start)
    r0, r1 = max(0, rows[0]), min(img.shape[0], rows[1])
    for _step in range(budget):
        nx = x + direction
        if nx < 0 or nx >= img.shape[1]:
            break
        col = img[r0:r1, nx].astype(np.float32)
        d_bg = np.linalg.norm(col - bg[None, :], axis=1)
        d_st = np.linalg.norm(col - stroke[None, :], axis=1)
        near_bg = (d_bg < ICON_COLOR_DIST).mean()
        near_any = (np.minimum(d_bg, d_st) < ICON_COLOR_DIST).mean()
        # a column must still show some true background — otherwise we have
        # left the text's container (e.g. white-on-pill text next to a beige
        # page whose colour happens to resemble the white stroke)
        if float(near_any) < 0.8 or float(near_bg) < 0.15:
            break
        x = nx
    return float(x)


def _region_for_line(img: np.ndarray, line: dict, width: int, height: int) -> tuple[int, int, int, int] | None:
    """Padded union of erasable char boxes.

    The right edge additionally honours the Vision line bbox: per-char boxes
    sometimes under-cover the last glyph, leaving a ghost char behind. The
    left edge stays char-box tight to protect leading icons/badges.
    """
    x0, y0, uw, uh = char_union(line)
    x1, y1 = x0 + uw, y0 + uh
    lx, ly, lw, lh = line["bbox"]
    x1 = max(x1, lx + lw)
    y0 = min(y0, ly)
    y1 = max(y1, ly + lh)
    h = line["bbox"][3]
    # Vision sometimes squeezes all boxes toward the line centre; when the
    # reported span falls short of the glyph-count estimate, widen both sides
    # so the first/last glyphs don't survive the erase as ghosts. Expansion is
    # column-guarded: it only crosses background- or ink-coloured columns, and
    # halts at frames, star outlines or illustrations.
    erasable_text = "".join(
        c["ch"]
        for c, keep in zip(line["chars"], erasable_chars(line["text"], line["strip_prefix"]))
        if keep
    )
    qbg, qstroke = _quick_colors(img, line)
    rows = (int(y0), int(y1))
    expected = est_text_width(erasable_text, y1 - y0)
    if (x1 - x0) < 0.92 * expected:
        budget = int((expected - (x1 - x0)) / 2 + 0.25 * h)
        x0 = _scan_expand(img, rows, x0, budget, -1, qbg, qstroke)
        x1 = _scan_expand(img, rows, x1, budget, +1, qbg, qstroke)
    # trailing pad is generous to catch glyphs OCR missed (e.g. a final 「!」);
    # the leading pad stays tight everywhere — badge numbers, 💡 bulbs and
    # ❤ icons sit just left of many lines and must never be clipped.
    # Pads are column-guarded too: a blind pad walks straight into box
    # borders, which then get masked and erased at this line's rows.
    pad_left = 0.12 * h
    pad_right = 0.25 * h if line["role"] in {"title", "banner"} else 0.45 * h
    # light text on a dark container (label chips, pill banners): keep the
    # vertical pad inside the container, or the inpaint window imports the
    # page colour from above/below and washes the container out
    light_on_dark = float(qstroke.mean()) > float(qbg.mean()) + 25
    if line["role"] in {"title", "banner"} or light_on_dark:
        pad_v = 0.10 * h
    else:
        pad_v = 0.22 * h
    safe_left = _scan_expand(img, rows, x0, int(pad_left) + 2, -1, qbg, qstroke)
    safe_right = _scan_expand(img, rows, x1, int(pad_right) + 2, +1, qbg, qstroke)
    rx0 = max(0, int(min(safe_left, x0 - 1)))
    ry0 = max(0, int(y0 - pad_v))
    rx1 = min(width, int(max(safe_right, x1 + 1)))
    ry1 = min(height, int(y1 + pad_v))
    if rx1 <= rx0 or ry1 <= ry0:
        return None
    return rx0, ry0, rx1, ry1


def _ring_pixels(img: np.ndarray, region: tuple[int, int, int, int], t: int = 3) -> np.ndarray:
    x0, y0, x1, y1 = region
    ox0, oy0 = max(0, x0 - t), max(0, y0 - t)
    ox1, oy1 = min(img.shape[1], x1 + t), min(img.shape[0], y1 + t)
    outer = img[oy0:oy1, ox0:ox1].astype(np.float32)
    mask = np.ones(outer.shape[:2], dtype=bool)
    mask[(y0 - oy0):(y1 - oy0), (x0 - ox0):(x1 - ox0)] = False
    ring = outer[mask]
    return ring if ring.size else img[y0:y1, x0:x1].reshape(-1, 3).astype(np.float32)


def line_mask_and_stats(
    img: np.ndarray, line: dict, width: int, height: int
) -> dict | None:
    """Build the stroke mask for one line; return mask, stroke color, bg stats."""
    region = _region_for_line(img, line, width, height)
    if region is None:
        return None
    x0, y0, x1, y1 = region
    patch = img[y0:y1, x0:x1].astype(np.float32)

    # background = median colour INSIDE the glyph boxes: glyph ink covers well
    # under half of a char box, so the median lands on whatever the text sits
    # on — the beige page, a green banner strip, or a coloured label chip.
    # (Sampling outside the boxes breaks whenever the text's own container is
    # smaller than the padded region: chip labels, panel subtitle strips.)
    char_area = np.zeros(patch.shape[:2], dtype=bool)
    flags = erasable_chars(line["text"], line["strip_prefix"])
    for c, keep in zip(line["chars"], flags):
        if not keep or c["bbox"] is None:
            continue
        cx0 = max(0, int(c["bbox"][0]) - x0)
        cy0 = max(0, int(c["bbox"][1]) - y0)
        cx1 = min(patch.shape[1], int(c["bbox"][0] + c["bbox"][2]) - x0 + 1)
        cy1 = min(patch.shape[0], int(c["bbox"][1] + c["bbox"][3]) - y0 + 1)
        if cx1 > cx0 and cy1 > cy0:
            char_area[cy0:cy1, cx0:cx1] = True
    bg_pixels = patch[char_area]
    if bg_pixels.shape[0] < 50:
        bg_pixels = _ring_pixels(img, region)
    bg_color = np.median(bg_pixels, axis=0)
    near_bg = bg_pixels[
        np.linalg.norm(bg_pixels - bg_color[None, :], axis=1) < 40
    ]
    bg_std = float(np.mean(np.std(near_bg, axis=0))) if near_bg.size else 0.0

    dist = np.linalg.norm(patch - bg_color[None, None, :], axis=2)
    dist_u8 = np.clip(dist, 0, 255).astype(np.uint8)
    _thresh, binary = cv2.threshold(dist_u8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # robust stroke colour: median-of-medians over each erasable char box —
    # immune to pollution from pill borders / icons inside the padded region
    char_medians = []
    for c, keep in zip(line["chars"], flags):
        if not keep or c["bbox"] is None:
            continue
        cx0 = max(0, int(c["bbox"][0]) - x0)
        cy0 = max(0, int(c["bbox"][1]) - y0)
        cx1 = min(patch.shape[1], int(c["bbox"][0] + c["bbox"][2]) - x0 + 1)
        cy1 = min(patch.shape[0], int(c["bbox"][1] + c["bbox"][3]) - y0 + 1)
        if cx1 <= cx0 or cy1 <= cy0:
            continue
        sub_patch = patch[cy0:cy1, cx0:cx1]
        sub_mask = binary[cy0:cy1, cx0:cx1] > 0
        if int(sub_mask.sum()) >= 10:
            char_medians.append(np.median(sub_patch[sub_mask], axis=0))
    if char_medians:
        stroke_color = np.median(np.stack(char_medians), axis=0)
    else:
        stroke_pixels = patch[binary > 0]
        stroke_color = (
            np.median(stroke_pixels, axis=0) if stroke_pixels.size else np.zeros(3)
        )

    # colour-component filter: coloured icons (💡 bulbs, ❤ hearts, ★ stars)
    # that OCR merged into the line span differ strongly from the text stroke
    # colour — unmask them so they survive the erase intact. Only icon-sized
    # components qualify; tiny fragments stay masked (else they'd linger as
    # smudges under the re-rendered text).
    min_icon_area = max(40.0, 0.10 * line["bbox"][3] ** 2)
    off_axis = off_axis_distance(patch, stroke_color, bg_color)
    dist_bg = np.linalg.norm(patch - bg_color[None, None, :], axis=2)
    # rescue zone: char boxes widened by one em — Vision's squeezed boxes
    # can miss the true first/last glyph positions
    em = max(4, int(line["bbox"][3]))
    rescue_zone = cv2.dilate(
        char_area.astype(np.uint8), np.ones((1, 2 * em + 1), np.uint8)
    ).astype(bool)
    keep_mask = np.zeros(patch.shape[:2], dtype=bool)

    n_comp, labels = cv2.connectedComponents(binary)
    if n_comp > 2:
        for comp in range(1, n_comp):
            comp_mask = labels == comp
            if float(comp_mask.sum()) < min_icon_area:
                continue
            comp_color = np.median(patch[comp_mask], axis=0)
            comp_off = float(
                off_axis_distance(comp_color[None, :], stroke_color, bg_color)[0]
            )
            ys, xs = np.nonzero(comp_mask)
            comp_area = float(comp_mask.sum())
            bbox_area = float((ys.max() - ys.min() + 1) * (xs.max() - xs.min() + 1))
            solid_block = (
                comp_area > 2.0 * em * em and comp_area / bbox_area > 0.85
            )
            if comp_off > ICON_OFF_AXIS or solid_block:
                binary[comp_mask] = 0
                keep_mask |= comp_mask
                # rescue: a glyph touching a frame/border merges into that
                # component and would survive the erase — re-mask the pixels
                # that sit near char boxes AND look like (possibly faded) ink
                rescue = comp_mask & rescue_zone & (off_axis < ICON_OFF_AXIS)
                binary[rescue] = 255
                keep_mask &= ~rescue

    # sweep pass: Otsu misses mid-tone glyph pixels (anti-aliased edges,
    # faded strokes); inpainting then regrows ghost strokes from them. Any
    # on-axis (ink-like) pixel near the char boxes that clearly differs from
    # the background joins the mask.
    # tighter zone than component rescue: sweeping a full em past the boxes
    # bites into neighbouring surfaces whose colour resembles the stroke
    # (beige page next to white-on-chip text)
    sweep_zone = cv2.dilate(
        char_area.astype(np.uint8), np.ones((1, int(0.8 * em) | 1), np.uint8)
    ).astype(bool)
    sweep = (
        sweep_zone
        & (off_axis < ICON_OFF_AXIS)
        & (dist_bg > 45.0)
        & (binary == 0)
        & ~keep_mask
    )
    binary[sweep] = 255

    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (2 * MASK_DILATE_PX + 1, 2 * MASK_DILATE_PX + 1)
    )
    dilated = cv2.dilate(binary, kernel)

    return {
        "region": region,
        "mask": dilated,
        "rescue_zone": rescue_zone,
        "keep_mask": keep_mask,
        "stroke_color": [float(c) for c in stroke_color],
        "bg_color": [float(c) for c in bg_color],
        "busy_background": bg_std > BUSY_BG_STD,
        "flat_background": bg_std < FLAT_BG_STD,
    }


LOCAL_MARGIN = 8


def erase_lines(img: np.ndarray, line_infos: list[dict]) -> np.ndarray:
    """Erase all lines via PER-LINE LOCAL inpaint (returns new image).

    A global union-mask inpaint lets colour propagate across lines and from
    distant dark outlines (star tips, frame corners), manufacturing smudge
    artifacts; a plain flat fill leaves the soft shadow halo around glyphs
    visible. Inpainting each line inside its own small window avoids both.
    """
    height, width = img.shape[:2]
    out = img.copy()
    for info in line_infos:
        x0, y0, x1, y1 = info["region"]
        if info.get("erase_mode") == "flat":
            fill = np.array(info["bg_color"], dtype=out.dtype)
            view = out[y0:y1, x0:x1]
            view[info["mask"] > 0] = fill
            continue
        wx0, wy0 = max(0, x0 - LOCAL_MARGIN), max(0, y0 - LOCAL_MARGIN)
        wx1, wy1 = min(width, x1 + LOCAL_MARGIN), min(height, y1 + LOCAL_MARGIN)
        window = out[wy0:wy1, wx0:wx1]
        mask_win = np.zeros(window.shape[:2], dtype=np.uint8)
        mask_win[(y0 - wy0):(y1 - wy0), (x0 - wx0):(x1 - wx0)] = info["mask"]
        if not mask_win.any():
            continue
        method = cv2.INPAINT_NS if info["busy_background"] else cv2.INPAINT_TELEA
        radius = 5 if info["busy_background"] else 3
        out[wy0:wy1, wx0:wx1] = cv2.inpaint(window, mask_win, radius, method)

    for info in line_infos:
        if info.get("erase_mode") != "flat":
            out = _despeckle(out, info)
    return out


def _despeckle(img: np.ndarray, info: dict) -> np.ndarray:
    """Remove small leftover stains inside a line's rescue zone.

    Residues that survive the mask (glyph slivers at region seams) are small,
    far from the background colour, not preserved icons, and float free of
    the window border — everything larger or border-touching is artwork.
    """
    x0, y0, x1, y1 = info["region"]
    patch = img[y0:y1, x0:x1].astype(np.float32)
    bg = np.asarray(info["bg_color"], dtype=np.float32)
    stroke = np.asarray(info["stroke_color"], dtype=np.float32)
    # leftovers are glyph slivers: ink-like (on the stroke↔bg colour axis)
    # and clearly not background — colourful icon details (💡 spark rays)
    # sit off-axis and must survive
    stains = (
        (np.linalg.norm(patch - bg[None, None, :], axis=2) > ICON_COLOR_DIST)
        & (off_axis_distance(patch, stroke, bg) < ICON_OFF_AXIS)
        & info["rescue_zone"]
        & ~info["keep_mask"]
    ).astype(np.uint8)
    if not stains.any():
        return img
    n_comp, labels = cv2.connectedComponents(stains)
    h_rows, w_cols = stains.shape
    out = img.copy()
    view = out[y0:y1, x0:x1]
    for comp in range(1, n_comp):
        comp_mask = labels == comp
        ys, xs = np.nonzero(comp_mask)
        if ys.min() == 0 or xs.min() == 0 or ys.max() == h_rows - 1 or xs.max() == w_cols - 1:
            continue  # touches the window border: part of larger artwork
        if comp_mask.sum() > 0.5 * info["mask"].shape[0] ** 2:
            continue  # too big to be a leftover sliver
        grown = cv2.dilate(comp_mask.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        view[grown] = bg
    return out
