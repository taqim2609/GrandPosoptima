#!/usr/bin/env python3
"""Update Planora Product Kit versions and propagate stale artifact states."""

from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path


SOURCE_TO_ARTIFACT = {
    "prd": "prd",
    "ui": "uiGuide",
    "dx": "dxGuide",
    "execution": "executionPlan",
}
DOWNSTREAM = {
    "prd": ("uiGuide", "dxGuide", "executionPlan"),
    "ui": ("executionPlan",),
    "dx": ("executionPlan",),
    "execution": (),
}
VERSION_RE = re.compile(r"^(\d+)\.(\d+)$")


def _bump(version: str) -> str:
    match = VERSION_RE.fullmatch(version)
    if not match:
        raise ValueError(f"Cannot increment non-major.minor version: {version!r}")
    return f"{match.group(1)}.{int(match.group(2)) + 1}"


def update_revision(package: Path, changed: str, reason: str) -> dict:
    root = package.expanduser().resolve()
    manifest_path = root / "manifest.json"
    if not root.is_dir() or not manifest_path.is_file():
        raise FileNotFoundError(f"Not a Planora package: {root}")
    if changed not in SOURCE_TO_ARTIFACT:
        raise ValueError(f"changed must be one of: {', '.join(SOURCE_TO_ARTIFACT)}")
    if not reason.strip():
        raise ValueError("reason must not be empty")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if root.name != ".planora" or not isinstance(manifest, dict) or manifest.get("packageDirectory") != ".planora":
        raise ValueError("Expected a .planora directory with manifest packageDirectory .planora")
    if manifest.get("formatVersion") != "1.0":
        raise ValueError("Only formatVersion 1.0 can be revised")
    source_key = SOURCE_TO_ARTIFACT[changed]
    source_versions = manifest.get("sourceVersions", {})
    artifacts = manifest.get("artifacts", {})
    if source_key not in source_versions or source_key not in artifacts:
        raise ValueError(f"Package does not contain artifact: {source_key}")

    previous = source_versions[source_key]
    current = _bump(previous)
    source_versions[source_key] = current
    artifacts[source_key]["sourceVersion"] = current
    artifacts[source_key]["status"] = "draft"
    for artifact_name in DOWNSTREAM[changed]:
        if artifact_name in artifacts:
            artifacts[artifact_name]["status"] = "stale"

    history = manifest.setdefault("revisionHistory", [])
    if not isinstance(history, list):
        raise ValueError("revisionHistory must be an array when present")
    history.append(
        {
            "date": date.today().isoformat(),
            "changed": changed,
            "fromVersion": previous,
            "toVersion": current,
            "reason": reason.strip(),
        }
    )
    manifest["generatedDate"] = date.today().isoformat()
    manifest["status"] = "draft"
    manifest["files"] = sorted(
        path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()
    )
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("--changed", choices=tuple(SOURCE_TO_ARTIFACT), required=True)
    parser.add_argument("--reason", required=True)
    args = parser.parse_args()
    try:
        manifest = update_revision(args.package, args.changed, args.reason)
    except (FileNotFoundError, ValueError, OSError, json.JSONDecodeError) as error:
        parser.exit(2, f"error: {error}\n")
    source_key = SOURCE_TO_ARTIFACT[args.changed]
    print(f"{source_key} updated to {manifest['sourceVersions'][source_key]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
