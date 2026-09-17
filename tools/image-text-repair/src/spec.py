"""spec.json + overrides.yaml I/O and merging. spec.json is machine truth."""
from __future__ import annotations

import json
from pathlib import Path

import yaml

SPEC_NAME = "spec.json"
OVERRIDES_NAME = "overrides.yaml"


def save_spec(work_dir: Path, spec: dict) -> None:
    work_dir.mkdir(parents=True, exist_ok=True)
    path = work_dir / SPEC_NAME
    path.write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")


def load_spec(work_dir: Path) -> dict:
    path = work_dir / SPEC_NAME
    if not path.is_file():
        raise SystemExit(f"missing {path}; run `extract` first")
    return json.loads(path.read_text(encoding="utf-8"))


def load_overrides(work_dir: Path) -> dict:
    path = work_dir / OVERRIDES_NAME
    if not path.is_file():
        return {"approved": False, "lines": {}}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise SystemExit(f"{path} is not a mapping")
    return {"approved": bool(data.get("approved", False)), "lines": data.get("lines") or {}}


def write_overrides_skeleton(work_dir: Path, spec: dict, force: bool = False) -> Path:
    """Pre-populate overrides.yaml with changed/flagged lines for user review."""
    path = work_dir / OVERRIDES_NAME
    if path.exists() and not force:
        return path
    doc_lines = [
        "# 審查閘門:確認 review.md 後把 approved 改為 true 才能 render。",
        "# 每行可用鍵:text(覆寫文字)/ skip: true(整行不動)/ weight: 300|400|700 / erase: flat",
        "approved: false",
        "lines:",
    ]
    interesting = [
        ln
        for ln in spec["lines"]
        if ln["in_scope"]
        and (
            (ln.get("corrected_text") or ln["render_ocr_text"]) != ln["render_ocr_text"]
            or ln.get("skip_suggested")
            or ln.get("flags")
        )
    ]
    if not interesting:
        doc_lines.append("  {}")
    for ln in interesting:
        doc_lines.append(f"  {ln['id']}:")
        if ln.get("skip_suggested"):
            doc_lines.append("    skip: true")
        else:
            text = ln.get("corrected_text") or ln["render_ocr_text"]
            doc_lines.append(f"    text: {json.dumps(text, ensure_ascii=False)}")
        if ln.get("flags"):
            doc_lines.append(f"    # flags: {', '.join(ln['flags'])}")
    path.write_text("\n".join(doc_lines) + "\n", encoding="utf-8")
    return path


def merged_lines(spec: dict, overrides: dict) -> list[dict]:
    """Apply overrides to in-scope lines; returns new dicts (spec untouched)."""
    out = []
    for ln in spec["lines"]:
        if not ln["in_scope"]:
            continue
        ov = overrides["lines"].get(ln["id"]) or {}
        if ov.get("skip"):
            continue
        merged = {**ln}
        if "text" in ov:
            merged["corrected_text"] = str(ov["text"])
        if "weight" in ov:
            merged["weight"] = int(ov["weight"])
        if "erase" in ov:
            merged["erase_mode"] = str(ov["erase"])
        out.append(merged)
    return out


def apply_corrections(spec: dict, corrections: dict) -> dict:
    """Merge proofread corrections {line_id: {text, reason}} into a new spec."""
    known = {ln["id"] for ln in spec["lines"] if ln["id"]}
    unknown = set(corrections) - known
    if unknown:
        raise SystemExit(f"corrections reference unknown line ids: {sorted(unknown)}")
    lines = []
    for ln in spec["lines"]:
        if ln["id"] and ln["id"] in corrections:
            entry = corrections[ln["id"]]
            if entry.get("skip"):
                lines.append(
                    {
                        **ln,
                        "skip_suggested": True,
                        "correction_reason": entry.get("reason", ""),
                    }
                )
            else:
                lines.append(
                    {
                        **ln,
                        "corrected_text": entry["text"],
                        "correction_reason": entry.get("reason", ""),
                    }
                )
        else:
            lines.append(ln)
    return {**spec, "lines": lines}
