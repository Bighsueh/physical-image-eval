#!/usr/bin/env python3
"""Image text-repair pipeline CLI.

Stages: extract -> proofread -> apply-corrections -> (user edits overrides.yaml,
sets approved: true) -> render -> qa. `verify` guards the read-only source tree.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

import cv2
import numpy as np
from PIL import Image

import verify as verify_mod
from classify import alignment_for, assign_ids, classify_lines, render_text_for
from config import (
    ROLE_WEIGHTS,
    companion_md_for,
    out_path_for,
    read_source_bytes,
    resolve_images,
    work_dir_for,
)
from erase import char_union, erase_lines, line_mask_and_stats
from ocr_vision import ocr_image
from qa import contact_sheet, roundtrip_check
from render import render_image
from report import write_proofread_bundle, write_review_md
from spec import (
    apply_corrections,
    load_overrides,
    load_spec,
    merged_lines,
    save_spec,
    write_overrides_skeleton,
)

LOW_CONFIDENCE = 0.8


def _load_rgb(path: Path) -> np.ndarray:
    data = np.frombuffer(read_source_bytes(path), dtype=np.uint8)
    bgr = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if bgr is None:
        raise SystemExit(f"cannot decode image: {path}")
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def _ring_bg(img: np.ndarray, bbox: list[float]) -> list[float]:
    x0, y0 = max(0, int(bbox[0]) - 4), max(0, int(bbox[1]) - 4)
    x1 = min(img.shape[1], int(bbox[0] + bbox[2]) + 4)
    y1 = min(img.shape[0], int(bbox[1] + bbox[3]) + 4)
    patch = img[y0:y1, x0:x1].astype(np.float32)
    if patch.size == 0:
        return [255.0, 255.0, 255.0]
    ring = np.concatenate([patch[0], patch[-1], patch[:, 0], patch[:, -1]])
    return [float(c) for c in np.median(ring, axis=0)]


def _panel_bounds(panel: str, width: int) -> tuple[float, float]:
    if panel in {"top", "bottom"}:
        return 0.02 * width, 0.98 * width
    if panel in {"p1", "p3"}:
        return 0.03 * width, 0.492 * width
    return 0.508 * width, 0.97 * width


def _avail_width(line: dict, width: int) -> float:
    left, right = _panel_bounds(line["panel"], width)
    x, _y, w, _h = line["render_bbox"]
    if alignment_for(line["role"]) == "center":
        cx = x + w / 2
        # cap at the original run width so re-rendered text can't spill over
        # adjacent icons (e.g. the ❤ before the bottom banner sentence)
        return min(2 * min(cx - left, right - cx), w * 1.06)
    return right - x


def _iou(a: list[float], b: list[float]) -> float:
    ix = max(0.0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def cmd_extract(image_path: Path) -> None:
    work = work_dir_for(image_path)
    img = _load_rgb(image_path)
    height, width = img.shape[:2]

    raw = ocr_image(image_path, width, height, language_correction=False)
    corrected_pass = ocr_image(image_path, width, height, language_correction=True)

    with_bg = [{**ln, "bg_color": _ring_bg(img, ln["bbox"])} for ln in raw]
    lines = assign_ids(classify_lines(with_bg, width, height))

    spec_lines = []
    crops_dir = work / "crops"
    crops_dir.mkdir(parents=True, exist_ok=True)
    for ln in lines:
        if not ln["in_scope"]:
            spec_lines.append(
                {
                    "id": None,
                    "in_scope": False,
                    "text": ln["text"],
                    "bbox": ln["bbox"],
                    "confidence": ln["confidence"],
                }
            )
            continue

        stats = line_mask_and_stats(img, ln, width, height)
        if stats is None:
            continue

        flags = []
        if stats["busy_background"]:
            flags.append("busy-background")
        if ln["confidence"] < LOW_CONFIDENCE:
            flags.append("low-conf")
        alt_text = None
        for other in corrected_pass:
            if _iou(ln["bbox"], other["bbox"]) > 0.5 and other["text"] != ln["text"]:
                alt_text = other["text"]
                flags.append("lc-disagree")
                break

        entry = {
            "id": ln["id"],
            "in_scope": True,
            "panel": ln["panel"],
            "role": ln["role"],
            "strip_prefix": ln["strip_prefix"],
            "text": ln["text"],
            "render_ocr_text": render_text_for(ln["text"], ln["strip_prefix"]),
            "corrected_text": None,
            "confidence": ln["confidence"],
            "alt_text": alt_text,
            "bbox": ln["bbox"],
            "render_bbox": char_union(ln),
            "chars": ln["chars"],
            "stroke_color": stats["stroke_color"],
            "bg_color": stats["bg_color"],
            "weight": ROLE_WEIGHTS[ln["role"]],
            "align": alignment_for(ln["role"]),
            "flags": flags,
        }
        entry["avail_width"] = _avail_width(entry, width)
        spec_lines.append(entry)

        x0, y0, x1, y1 = stats["region"]
        Image.fromarray(img[y0:y1, x0:x1]).save(crops_dir / f"{ln['id']}.png")

    spec = {
        "image": str(image_path),
        "region": image_path.parent.name,
        "stem": image_path.stem,
        "width": width,
        "height": height,
        "lines": spec_lines,
    }
    save_spec(work, spec)
    in_scope = [l for l in spec_lines if l["in_scope"]]
    flagged = [l for l in in_scope if l["flags"]]
    print(
        f"[extract] {image_path.stem}: {len(in_scope)} in-scope lines "
        f"({len(flagged)} flagged), spec -> {work / 'spec.json'}"
    )


def _erase_and_render(image_path: Path, lines: list[dict]) -> tuple[Image.Image, Image.Image, dict]:
    img = _load_rgb(image_path)
    height, width = img.shape[:2]
    infos = []
    fresh_lines = []
    for ln in lines:
        stats = line_mask_and_stats(img, ln, width, height)
        if stats is None:
            continue
        infos.append({**stats, "erase_mode": ln.get("erase_mode")})
        # render with the freshly computed colours — the ones stored in the
        # spec froze whatever the estimator did at extract time
        fresh_lines.append(
            {**ln, "stroke_color": stats["stroke_color"], "bg_color": stats["bg_color"]}
        )
    erased_np = erase_lines(img, infos)
    erased = Image.fromarray(erased_np)
    final, raised = render_image(erased, fresh_lines)
    return erased, final, raised


def cmd_render(image_path: Path, identity: bool, preview: bool = False) -> None:
    work = work_dir_for(image_path)
    spec = load_spec(work)

    if identity:
        lines = [dict(ln) for ln in spec["lines"] if ln["in_scope"]]
        erased, final, raised = _erase_and_render(image_path, lines)
        erased.save(work / "erased.png")
        final.save(work / "identity.png")
        print(f"[render --identity] -> {work / 'identity.png'}")
    elif preview:
        overrides = load_overrides(work)
        lines = merged_lines(spec, overrides)
        erased, final, raised = _erase_and_render(image_path, lines)
        erased.save(work / "erased.png")
        final.save(work / "preview.png")
        print(f"[render --preview] -> {work / 'preview.png'} (未輸出至修正版目錄)")
    else:
        overrides = load_overrides(work)
        if not overrides["approved"]:
            raise SystemExit(
                f"{work / 'overrides.yaml'} 尚未 approved: true — 請先確認 review.md"
            )
        lines = merged_lines(spec, overrides)
        erased, final, raised = _erase_and_render(image_path, lines)
        erased.save(work / "erased.png")
        out = out_path_for(image_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        final.save(out)
        print(f"[render] -> {out}")

    for line_id, flags in raised.items():
        print(f"  ⚠ {line_id}: {', '.join(flags)}")


def cmd_proofread(image_path: Path) -> None:
    work = work_dir_for(image_path)
    spec = load_spec(work)
    bundle = write_proofread_bundle(work, spec)
    md = companion_md_for(image_path)
    print(f"[proofread] bundle -> {bundle} (企劃: {md if md else '無'})")


def cmd_apply_corrections(image_path: Path, corrections_file: Path) -> None:
    work = work_dir_for(image_path)
    spec = load_spec(work)
    corrections = json.loads(corrections_file.read_text(encoding="utf-8"))
    updated = apply_corrections(spec, corrections)
    save_spec(work, updated)
    review = write_review_md(work, updated)
    overrides = write_overrides_skeleton(work, updated, force=True)
    print(f"[apply-corrections] {len(corrections)} 行已更新")
    print(f"  review    -> {review}")
    print(f"  overrides -> {overrides} (確認後改 approved: true)")


def cmd_qa(image_path: Path) -> None:
    work = work_dir_for(image_path)
    spec = load_spec(work)
    out = out_path_for(image_path)
    if not out.is_file():
        raise SystemExit(f"final output missing ({out}); run render first")
    original = Image.fromarray(_load_rgb(image_path))
    erased_path = work / "erased.png"
    erased = Image.open(erased_path) if erased_path.is_file() else original
    final = Image.open(out)
    sheet = work / "qa_sheet.png"
    contact_sheet(original, erased, final, sheet)

    overrides = load_overrides(work)
    expected = merged_lines(spec, overrides)
    mismatches = roundtrip_check(out, expected)
    report = work / "qa_report.md"
    lines = [f"# QA:{spec['stem']}", "", f"round-trip 不一致:{len(mismatches)}", ""]
    for m in mismatches:
        lines.append(f"- `{m['id']}` 期望「{m['expected']}」 重讀「{m['reocr']}」 iou={m['iou']}")
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"[qa] sheet -> {sheet}")
    print(f"[qa] round-trip mismatches: {len(mismatches)} -> {report}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "stage",
        choices=["extract", "proofread", "apply-corrections", "render", "qa", "verify", "snapshot"],
    )
    parser.add_argument("--image", help="blueprint id (S1) or full stem")
    parser.add_argument("--region", help="region folder name, e.g. 01_肩部_SHOULDER")
    parser.add_argument("--all", action="store_true", help="all images")
    parser.add_argument("--identity", action="store_true", help="render OCR text as-is to work/ (no approval needed)")
    parser.add_argument("--preview", action="store_true", help="render corrected text to work/preview.png (no approval needed, no mirror output)")
    parser.add_argument("--corrections", help="corrections JSON file (apply-corrections)")
    args = parser.parse_args()

    if args.stage == "verify":
        sys.exit(0 if verify_mod.verify() else 1)
    if args.stage == "snapshot":
        verify_mod.snapshot()
        return

    if not (args.image or args.region or args.all):
        raise SystemExit("pick a target: --image / --region / --all")
    images = resolve_images(args.image, args.region)

    for image_path in images:
        if args.stage == "extract":
            cmd_extract(image_path)
        elif args.stage == "proofread":
            cmd_proofread(image_path)
        elif args.stage == "apply-corrections":
            if not args.corrections:
                raise SystemExit("apply-corrections needs --corrections file.json")
            cmd_apply_corrections(image_path, Path(args.corrections))
        elif args.stage == "render":
            cmd_render(image_path, args.identity, args.preview)
        elif args.stage == "qa":
            cmd_qa(image_path)


if __name__ == "__main__":
    main()
