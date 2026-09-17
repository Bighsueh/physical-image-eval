"""Central paths and constants. SOURCE_ROOT is strictly read-only."""
from __future__ import annotations

import os
from pathlib import Path

TOOL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = TOOL_ROOT.parent.parent

# Set IMAGE_SOURCE_DIR (absolute, or relative to the repo root); defaults to the repo-root copy.
SOURCE_ROOT = (REPO_ROOT / os.environ.get("IMAGE_SOURCE_DIR", "images")).resolve()
SOURCE_IMAGES = SOURCE_ROOT / "_產圖"

# Corrected mirror of the source tree. IMAGE_OUTPUT_DIR overrides; default is a sibling
# `<source>_修正版` directory, so the source itself is never written.
OUT_ROOT = (
    (REPO_ROOT / os.environ["IMAGE_OUTPUT_DIR"]).resolve()
    if os.environ.get("IMAGE_OUTPUT_DIR")
    else SOURCE_ROOT.parent / f"{SOURCE_ROOT.name}_修正版"
)
OUT_IMAGES = OUT_ROOT / "_產圖"

WORK_DIR = TOOL_ROOT / "work"
FONTS_DIR = TOOL_ROOT / "fonts"

FONT_FILES = {
    300: FONTS_DIR / "LXGWWenKaiTC-Light.ttf",
    400: FONTS_DIR / "LXGWWenKaiTC-Regular.ttf",
    700: FONTS_DIR / "LXGWWenKaiTC-Bold.ttf",
}

# role -> font weight
ROLE_WEIGHTS = {
    "title": 700,
    "subtitle": 700,
    "body": 400,
    "tip": 400,
    "tip_title": 700,
    "banner": 400,
    "star": 700,
    "other": 400,
}

# geometry heuristics (fractions of image height)
TITLE_ZONE = 0.12
BANNER_ZONE = 0.90

# reserved non-region folders inside _產圖
NON_REGION_DIRS = {"_tools"}


def assert_not_in_source(path: Path) -> Path:
    """Guard: refuse any output path that falls inside the read-only source tree."""
    resolved = path.resolve()
    if str(resolved).startswith(str(SOURCE_ROOT.resolve()) + "/") or resolved == SOURCE_ROOT.resolve():
        raise RuntimeError(f"refusing to write inside read-only source tree: {resolved}")
    return path


def read_source_bytes(path: Path) -> bytes:
    """The only sanctioned way to touch source files: binary read."""
    with open(path, "rb") as fh:
        return fh.read()


def find_source_images() -> list[Path]:
    """All blueprint PNGs, sorted by region folder then filename."""
    if not SOURCE_IMAGES.is_dir():
        raise FileNotFoundError(f"source image dir not found: {SOURCE_IMAGES}")
    pngs = [
        p
        for p in sorted(SOURCE_IMAGES.rglob("*.png"))
        if p.parent.name not in NON_REGION_DIRS
    ]
    if not pngs:
        raise FileNotFoundError(f"no PNGs found under {SOURCE_IMAGES}")
    return pngs


def resolve_images(selector: str | None, region: str | None) -> list[Path]:
    """Resolve --image / --region / --all selection to source PNG paths."""
    images = find_source_images()
    if selector:
        matched = [
            p
            for p in images
            if p.stem == selector or p.stem.split("_", 1)[0] == selector
        ]
        if not matched:
            raise SystemExit(f"no source image matches --image {selector!r}")
        return matched
    if region:
        matched = [p for p in images if p.parent.name == region]
        if not matched:
            regions = sorted({p.parent.name for p in images})
            raise SystemExit(
                f"no region named {region!r}; available: {', '.join(regions)}"
            )
        return matched
    return images


def work_dir_for(image_path: Path) -> Path:
    return WORK_DIR / image_path.parent.name / image_path.stem


def out_path_for(image_path: Path) -> Path:
    out = OUT_IMAGES / image_path.parent.name / image_path.name
    return assert_not_in_source(out)


def companion_md_for(image_path: Path) -> Path | None:
    """Planning doc lives at <SOURCE_ROOT>/<region>/<stem>.md (outside _產圖)."""
    md = SOURCE_ROOT / image_path.parent.name / (image_path.stem + ".md")
    return md if md.is_file() else None
