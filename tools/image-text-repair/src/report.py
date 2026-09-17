"""Human-facing artifacts: proofread bundle + review.md."""
from __future__ import annotations

from pathlib import Path

from config import companion_md_for


def write_proofread_bundle(work_dir: Path, spec: dict) -> Path:
    """OCR lines + companion planning doc, for the AI/human proofreader."""
    parts = [
        f"# 校對輸入:{spec['stem']}",
        "",
        "## 圖上 OCR 文字(id | role | conf | 文字)",
        "",
    ]
    for ln in spec["lines"]:
        if not ln["in_scope"]:
            continue
        alt = f"  ⚠ 校正pass讀作: {ln['alt_text']!r}" if ln.get("alt_text") else ""
        flags = f"  flags={','.join(ln['flags'])}" if ln.get("flags") else ""
        parts.append(
            f"- `{ln['id']}` [{ln['role']}] conf={ln['confidence']:.2f} 「{ln['render_ocr_text']}」{alt}{flags}"
        )
    md_path = companion_md_for(Path(spec["image"]))
    parts += ["", "## 企劃文件(校對參考)", ""]
    if md_path:
        parts.append(md_path.read_text(encoding="utf-8"))
    else:
        parts.append("(找不到對應企劃 md)")
    out = work_dir / "proofread_input.md"
    out.write_text("\n".join(parts), encoding="utf-8")
    return out


def write_review_md(work_dir: Path, spec: dict) -> Path:
    """review.md: only changed/flagged rows prominent; unchanged collapsed."""
    changed, unchanged = [], []
    for ln in spec["lines"]:
        if not ln["in_scope"]:
            continue
        corrected = ln.get("corrected_text")
        if (
            (corrected and corrected != ln["render_ocr_text"])
            or ln.get("skip_suggested")
            or ln.get("flags")
        ):
            changed.append(ln)
        else:
            unchanged.append(ln)

    parts = [f"# 校對報告:{spec['stem']}", ""]
    if changed:
        parts += [
            "## 需確認(文字有修改或有 flag)",
            "",
            "| line id | 原圖裁切 | OCR 原文 | 修正後 | 原因 | flags |",
            "|---|---|---|---|---|---|",
        ]
        for ln in changed:
            parts.append(
                "| `{id}` | ![]({crop}) | {ocr} | **{fix}** | {reason} | {flags} |".format(
                    id=ln["id"],
                    crop=f"crops/{ln['id']}.png",
                    ocr=ln["render_ocr_text"],
                    fix="(整行跳過)" if ln.get("skip_suggested") else (ln.get("corrected_text") or ln["render_ocr_text"]),
                    reason=ln.get("correction_reason", ""),
                    flags=", ".join(ln.get("flags", [])),
                )
            )
    else:
        parts.append("(無任何修改或 flag)")

    parts += ["", "<details><summary>未變更的行</summary>", ""]
    for ln in unchanged:
        parts.append(f"- `{ln['id']}` 「{ln['render_ocr_text']}」")
    parts += ["", "</details>", ""]

    out = work_dir / "review.md"
    out.write_text("\n".join(parts), encoding="utf-8")
    return out
