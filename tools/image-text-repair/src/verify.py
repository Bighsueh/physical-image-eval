"""Source-tree integrity: snapshot (size, mtime_ns, sha256) and diff."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from config import SOURCE_ROOT, WORK_DIR, read_source_bytes

MANIFEST_PATH = WORK_DIR / "source_manifest.json"


def _tree_manifest() -> dict[str, dict]:
    manifest = {}
    for path in sorted(SOURCE_ROOT.rglob("*")):
        if not path.is_file() or path.name == ".DS_Store":
            continue
        stat = path.stat()
        digest = hashlib.sha256(read_source_bytes(path)).hexdigest()
        manifest[str(path.relative_to(SOURCE_ROOT))] = {
            "size": stat.st_size,
            "mtime_ns": stat.st_mtime_ns,
            "sha256": digest,
        }
    return manifest


def snapshot() -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps(_tree_manifest(), ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"snapshot written: {MANIFEST_PATH}")


def verify() -> bool:
    if not MANIFEST_PATH.is_file():
        snapshot()
        print("no prior snapshot existed; baseline created — rerun after batches")
        return True
    before = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    after = _tree_manifest()
    problems = []
    for rel in sorted(set(before) | set(after)):
        if rel not in after:
            problems.append(f"DELETED: {rel}")
        elif rel not in before:
            problems.append(f"ADDED:   {rel}")
        elif before[rel] != after[rel]:
            problems.append(f"CHANGED: {rel}")
    if problems:
        print("SOURCE TREE MODIFIED — this must never happen:")
        for p in problems:
            print(f"  {p}")
        return False
    print(f"source tree intact ({len(after)} files match snapshot)")
    return True
