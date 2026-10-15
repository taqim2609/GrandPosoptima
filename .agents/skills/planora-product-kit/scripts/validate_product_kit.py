#!/usr/bin/env python3
"""Validate a completed Planora Product Kit package."""

from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path, PurePosixPath
from urllib.parse import unquote


ALLOWED_GUIDE_TYPES = {"ui", "dx", "hybrid"}
ALLOWED_STATUSES = {"draft", "ready", "blocked", "stale"}
ALLOWED_LOCALES = {"id-ID", "en-US"}
TEMPLATE_MARKERS = ("__PLANORA_REQUIRED__", "{{")
LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
ORDINAL_NAME_RE = re.compile(r"^(?:fitur|feature|screen|phase)[_-]?\d+\.md$", re.IGNORECASE)
FR_ID_RE = re.compile(r"\b[A-Z][A-Z0-9]{1,11}-FR-\d{3}\b")
AC_ID_RE = re.compile(r"\b[A-Z][A-Z0-9]{1,11}-AC-\d{3}\b")
TASK_HEADER_RE = re.compile(
    r"^- \[(?P<checked>[ xX])\]\s+`(?P<id>(?:TASK|BUG|CHG)-\d{3})`\s+[—-]\s+.+$",
    re.MULTILINE,
)
TODO_STATUS_RE = re.compile(r"^\s{2}- Status:\s+`(?P<status>pending|in_progress|blocked|done|skipped)`\s*$", re.MULTILINE)
TODO_WORKFLOW_RE = re.compile(r"^\s{2}- Workflow:\s+`(?P<workflow>feature|bug|chore)`\s*$", re.MULTILINE)


def _is_safe_package_path(value: object) -> bool:
    if not isinstance(value, str) or not value or "\\" in value:
        return False
    pure = PurePosixPath(value)
    return not pure.is_absolute() and ".." not in pure.parts and not re.match(r"^[A-Za-z]:", value)


def _required_files(guide_type: str) -> set[str]:
    files = {
        "README.md",
        "manifest.json",
        "PRD/README.md",
        "PRD/PRD.md",
        "PRD/asumsi-dan-pertanyaan.md",
        "PRD/metrik-keberhasilan.md",
        "PRD/model-data.md",
        "PRD/non-functional-requirements.md",
        "PRD/roadmap.md",
        "EXECUTION/README.md",
        "EXECUTION/TODO.md",
        "EXECUTION/feature-order.md",
        "EXECUTION/release-readiness.md",
        "EXECUTION/phases/phase-00-decisions.md",
    }
    if guide_type in {"ui", "hybrid"}:
        files.update(
            {
                "UI/README.md",
                "UI/design-direction.md",
                "UI/accessibility.md",
                "UI/content-guidelines.md",
                "UI/foundations/README.md",
                "UI/components/README.md",
                "UI/patterns/README.md",
                "UI/screens/screen-inventory.md",
            }
        )
    if guide_type in {"dx", "hybrid"}:
        files.update(
            {
                "DX/README.md",
                "DX/experience-principles.md",
                "DX/authentication-experience.md",
                "DX/errors-and-recovery.md",
                "DX/quickstart.md",
                "DX/api-ergonomics.md",
                "DX/sdk-and-cli-guidelines.md",
                "DX/documentation-standards.md",
                "DX/sandbox-and-testing.md",
                "DX/observability-and-support.md",
                "DX/compatibility-and-versioning.md",
            }
        )
    return files


def _read_text(path: Path, errors: list[str]) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        errors.append(f"cannot read UTF-8 text {path}: {error}")
        return None


def _validate_markdown(root: Path, path: Path, errors: list[str]) -> None:
    text = _read_text(path, errors)
    if text is None:
        return
    relative = path.relative_to(root).as_posix()
    lines = text.splitlines()
    if not lines or not lines[0].startswith("# "):
        errors.append(f"Markdown file must start with one H1: {relative}")
    if sum(1 for line in lines if line.startswith("```")) % 2:
        errors.append(f"unbalanced fenced code block: {relative}")
    for marker in TEMPLATE_MARKERS:
        if marker in text:
            errors.append(f"unresolved template marker {marker!r}: {relative}")

    for match in LINK_RE.finditer(text):
        raw_target = match.group(1).strip()
        if raw_target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        target = raw_target.split("#", 1)[0].strip("<>")
        if not target:
            continue
        resolved = (path.parent / unquote(target)).resolve()
        try:
            resolved.relative_to(root)
        except ValueError:
            errors.append(f"relative link escapes package in {relative}: {raw_target}")
            continue
        if not resolved.exists():
            errors.append(f"broken relative link in {relative}: {raw_target}")


def _validate_feature(root: Path, path: Path, errors: list[str]) -> None:
    text = _read_text(path, errors)
    if text is None:
        return
    relative = path.relative_to(root).as_posix()
    if not re.search(r"^## (?:Functional requirements|Kebutuhan fungsional)", text, re.MULTILINE | re.IGNORECASE):
        errors.append(f"feature lacks Functional requirements heading: {relative}")
    if not re.search(r"^## (?:Acceptance criteria|Kriteria penerimaan)", text, re.MULTILINE | re.IGNORECASE):
        errors.append(f"feature lacks Acceptance criteria heading: {relative}")
    if not FR_ID_RE.search(text):
        errors.append(f"feature lacks stable FR ID: {relative}")
    if not AC_ID_RE.search(text):
        errors.append(f"feature lacks stable AC ID: {relative}")


def _validate_phase(root: Path, path: Path, errors: list[str]) -> None:
    text = _read_text(path, errors)
    if text is None:
        return
    relative = path.relative_to(root).as_posix()
    if not re.search(r"^## (?:Dependencies|Dependensi)", text, re.MULTILINE | re.IGNORECASE):
        errors.append(f"phase lacks Dependencies heading: {relative}")
    if not re.search(r"^## (?:Execution workflows|Workflow eksekusi)", text, re.MULTILINE | re.IGNORECASE):
        errors.append(f"phase lacks Execution workflows heading: {relative}")
    if not re.search(r"^## (?:Exit criteria|Kriteria keluar)", text, re.MULTILINE | re.IGNORECASE):
        errors.append(f"phase lacks Exit criteria heading: {relative}")


def _validate_todo(root: Path, errors: list[str]) -> None:
    path = root / "EXECUTION/TODO.md"
    if not path.is_file():
        return
    text = _read_text(path, errors)
    if text is None:
        return
    if not re.search(r"^## (?:Execution checklist|Checklist eksekusi)", text, re.MULTILINE | re.IGNORECASE):
        errors.append("EXECUTION/TODO.md lacks execution checklist heading")
    tasks = list(TASK_HEADER_RE.finditer(text))
    if not tasks:
        errors.append("EXECUTION/TODO.md must contain at least one TASK-, BUG-, or CHG- checklist item")
    if not FR_ID_RE.search(text):
        errors.append("EXECUTION/TODO.md must reference at least one PRD requirement ID")
    task_ids = [match.group("id") for match in tasks]
    if len(task_ids) != len(set(task_ids)):
        errors.append("EXECUTION/TODO.md contains duplicate task IDs")
    for index, task in enumerate(tasks):
        block_end = tasks[index + 1].start() if index + 1 < len(tasks) else len(text)
        block = text[task.start():block_end]
        status_match = TODO_STATUS_RE.search(block)
        if status_match is None:
            errors.append(f"EXECUTION/TODO.md task {task.group('id')} lacks a valid Status field")
            continue
        workflow_match = TODO_WORKFLOW_RE.search(block)
        if workflow_match is None:
            errors.append(f"EXECUTION/TODO.md task {task.group('id')} lacks a valid Workflow field")
        else:
            prefix = task.group("id").split("-", 1)[0]
            workflow = workflow_match.group("workflow")
            allowed_workflows = {
                "TASK": {"feature"},
                "BUG": {"bug"},
                "CHG": {"feature", "chore"},
            }
            if workflow not in allowed_workflows[prefix]:
                errors.append(
                    f"EXECUTION/TODO.md task {task.group('id')} cannot use Workflow `{workflow}`"
                )
        status = status_match.group("status")
        checked = task.group("checked").lower() == "x"
        if checked != (status == "done"):
            errors.append(f"EXECUTION/TODO.md task {task.group('id')} checkbox and status disagree")
        required_fields = {
            "phase": r"^\s{2}- (?:Phase|Fase):",
            "requirements": r"^\s{2}- Requirements?:",
            "dependencies": r"^\s{2}- (?:Dependencies|Dependensi):",
            "validation": r"^\s{2}- (?:Validation|Validasi):",
            "evidence": r"^\s{2}- (?:Evidence|Bukti):",
        }
        for field, pattern in required_fields.items():
            if not re.search(pattern, block, re.MULTILINE | re.IGNORECASE):
                errors.append(f"EXECUTION/TODO.md task {task.group('id')} lacks {field} field")


def _validate_main_prd(root: Path, locale: str, errors: list[str]) -> None:
    path = root / "PRD/PRD.md"
    if not path.is_file():
        return
    text = _read_text(path, errors)
    if text is None:
        return
    if locale == "id-ID":
        required = {
            "ringkasan": r"Ringkasan|Summary",
            "masalah": r"Latar belakang(?: dan masalah)?|Masalah|Problem",
            "tujuan": r"Tujuan|Goals?",
            "non-goals": r"Non-goals?|Bukan tujuan",
            "target pengguna": r"Target pengguna|Pengguna|Users?",
            "scope": r"Scope|Ruang lingkup",
            "risiko": r"Risiko|Risks?",
            "definition of done": r"Definition of done|Definisi selesai",
        }
    else:
        required = {
            "summary": r"Summary",
            "problem": r"Background(?: and problem)?|Problem",
            "goals": r"Goals?",
            "non-goals": r"Non-goals?",
            "users": r"Target users?|Users?",
            "scope": r"Scope",
            "risks": r"Risks?",
            "definition of done": r"Definition of done",
        }
    for label, heading in required.items():
        if not re.search(rf"^##\s+(?:\d+\.\s*)?(?:{heading})\s*$", text, re.MULTILINE | re.IGNORECASE):
            errors.append(f"PRD/PRD.md lacks required section: {label}")


def validate_package(package: Path) -> list[str]:
    root = package.expanduser().resolve()
    errors: list[str] = []
    if not root.is_dir():
        return [f"package directory does not exist: {root}"]
    if root.name != ".planora":
        errors.append("package directory must use the fixed name: .planora")

    manifest_path = root / "manifest.json"
    if not manifest_path.is_file():
        return ["missing required file: manifest.json"]
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        return [f"invalid manifest.json: {error}"]

    if not isinstance(manifest, dict):
        return ["manifest must be a JSON object"]

    guide_type = manifest.get("guideType")
    if guide_type not in ALLOWED_GUIDE_TYPES:
        errors.append("manifest guideType must be ui, dx, or hybrid")
        guide_type = "ui"
    if manifest.get("status") not in ALLOWED_STATUSES:
        errors.append("manifest status must be draft, ready, blocked, or stale")
    if manifest.get("formatVersion") != "1.0":
        errors.append("manifest formatVersion must be 1.0")
    if manifest.get("packageDirectory") != ".planora":
        errors.append("manifest packageDirectory must be .planora")
    project = manifest.get("project")
    if not isinstance(project, dict) or not all(project.get(key) for key in ("id", "name", "locale")):
        errors.append("manifest project must contain id, name, and locale")
    else:
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", str(project["id"])):
            errors.append("manifest project id must be lowercase kebab-case")
        if project["locale"] not in ALLOWED_LOCALES:
            errors.append(f"manifest project locale must be one of: {', '.join(sorted(ALLOWED_LOCALES))}")
    try:
        date.fromisoformat(manifest.get("generatedDate", ""))
    except (TypeError, ValueError):
        errors.append("manifest generatedDate must use YYYY-MM-DD")
    blockers = manifest.get("openBlockers")
    if not isinstance(blockers, list) or not all(isinstance(item, str) for item in blockers):
        errors.append("manifest openBlockers must be an array of strings")

    expected_artifacts = {"prd", "executionPlan"}
    expected_versions = {"prd", "executionPlan"}
    if guide_type in {"ui", "hybrid"}:
        expected_artifacts.add("uiGuide")
        expected_versions.add("uiGuide")
    if guide_type in {"dx", "hybrid"}:
        expected_artifacts.add("dxGuide")
        expected_versions.add("dxGuide")
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, dict) or set(artifacts) != expected_artifacts:
        errors.append(f"manifest artifacts must be exactly: {', '.join(sorted(expected_artifacts))}")
        artifacts = {}
    source_versions = manifest.get("sourceVersions")
    if not isinstance(source_versions, dict) or set(source_versions) != expected_versions:
        errors.append(f"manifest sourceVersions must be exactly: {', '.join(sorted(expected_versions))}")
        source_versions = {}
    expected_directories = {
        "prd": "PRD",
        "uiGuide": "UI",
        "dxGuide": "DX",
        "executionPlan": "EXECUTION",
    }
    for name, artifact in artifacts.items():
        if not isinstance(artifact, dict):
            errors.append(f"manifest artifact {name} must be an object")
            continue
        if not all(artifact.get(key) for key in ("directory", "entry", "sourceVersion", "status")):
            errors.append(f"manifest artifact {name} lacks directory, entry, sourceVersion, or status")
            continue
        if artifact["status"] not in ALLOWED_STATUSES:
            errors.append(f"manifest artifact {name} has invalid status")
        entry = artifact["entry"]
        if artifact["directory"] != expected_directories[name]:
            errors.append(f"manifest artifact {name} directory must be {expected_directories[name]}")
        if source_versions.get(name) != artifact["sourceVersion"]:
            errors.append(f"manifest artifact {name} sourceVersion does not match sourceVersions")
        entry_is_safe = _is_safe_package_path(entry)
        if not entry_is_safe:
            errors.append(f"unsafe manifest artifact entry: {entry}")
        elif not (root / entry).is_file():
            errors.append(f"manifest artifact {name} entry does not exist: {entry}")
    if manifest.get("status") == "ready" and any(
        artifact.get("status") in {"draft", "blocked", "stale"}
        for artifact in artifacts.values()
        if isinstance(artifact, dict)
    ):
        errors.append("manifest cannot be ready while an artifact is draft, blocked, or stale")

    history = manifest.get("revisionHistory", [])
    if not isinstance(history, list):
        errors.append("manifest revisionHistory must be an array when present")
    else:
        for index, revision in enumerate(history):
            if not isinstance(revision, dict) or not all(
                revision.get(key) for key in ("date", "changed", "fromVersion", "toVersion", "reason")
            ):
                errors.append(f"revisionHistory[{index}] is incomplete")
                continue
            if revision["changed"] not in {"prd", "ui", "dx", "execution"}:
                errors.append(f"revisionHistory[{index}] has invalid changed value")
            try:
                date.fromisoformat(revision["date"])
            except (TypeError, ValueError):
                errors.append(f"revisionHistory[{index}] has invalid date")

    listed_value = manifest.get("files")
    if not isinstance(listed_value, list) or not all(isinstance(item, str) for item in listed_value):
        errors.append("manifest files must be an array of strings")
        listed: list[str] = []
    else:
        listed = listed_value
    if len(listed) != len(set(listed)):
        errors.append("manifest files contains duplicate entries")
    for item in listed:
        if not _is_safe_package_path(item):
            errors.append(f"unsafe manifest path: {item}")
    for name, artifact in artifacts.items():
        entry = artifact.get("entry") if isinstance(artifact, dict) else None
        if isinstance(entry, str) and entry not in listed:
            errors.append(f"manifest artifact {name} entry is missing from files: {entry}")

    actual = sorted(path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file())
    missing_on_disk = sorted(set(listed) - set(actual))
    unlisted = sorted(set(actual) - set(listed))
    for item in missing_on_disk:
        errors.append(f"manifest entry missing on disk: {item}")
    for item in unlisted:
        errors.append(f"file missing from manifest: {item}")

    for required in sorted(_required_files(guide_type)):
        if not (root / required).is_file():
            errors.append(f"missing required file: {required}")
    if guide_type == "ui" and (root / "DX").exists():
        errors.append("DX directory is not allowed when guideType is ui")
    if guide_type == "dx" and (root / "UI").exists():
        errors.append("UI directory is not allowed when guideType is dx")

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if ORDINAL_NAME_RE.match(path.name):
            errors.append(f"ordinal filename is not allowed: {path.relative_to(root).as_posix()}")
        if path.suffix.lower() == ".md":
            _validate_markdown(root, path, errors)

    manifest_text = json.dumps(manifest, ensure_ascii=False)
    for marker in TEMPLATE_MARKERS:
        if marker in manifest_text:
            errors.append(f"unresolved template marker {marker!r}: manifest.json")

    feature_files = sorted((root / "PRD" / "fitur").glob("*.md"))
    if not feature_files:
        errors.append("PRD/fitur must contain at least one semantic feature file")
    for path in feature_files:
        _validate_feature(root, path, errors)
    all_ids: list[str] = []
    for path in feature_files:
        text = _read_text(path, errors)
        if text is not None:
            all_ids.extend(FR_ID_RE.findall(text))
            all_ids.extend(AC_ID_RE.findall(text))
    duplicate_ids = sorted(identifier for identifier in set(all_ids) if all_ids.count(identifier) > 1)
    for identifier in duplicate_ids:
        errors.append(f"duplicate requirement ID: {identifier}")

    locale = project.get("locale") if isinstance(project, dict) else "id-ID"
    _validate_main_prd(root, locale, errors)
    _validate_todo(root, errors)

    phase_files = sorted((root / "EXECUTION" / "phases").glob("*.md"))
    if not phase_files:
        errors.append("EXECUTION/phases must contain at least one phase file")
    for path in phase_files:
        _validate_phase(root, path, errors)

    if len(phase_files) < 2:
        errors.append("EXECUTION/phases must include phase 00 and at least one delivery phase")
    for path in phase_files:
        if path.name != "phase-00-decisions.md":
            text = _read_text(path, errors)
            if text is not None and not FR_ID_RE.search(text):
                errors.append(
                    f"delivery phase lacks PRD requirement reference: {path.relative_to(root).as_posix()}"
                )

    if guide_type in {"ui", "hybrid"}:
        topic_directories = {
            "UI/foundations": "foundation topic",
            "UI/components": "component specification",
            "UI/patterns": "interaction pattern",
            "UI/screens": "screen specification",
        }
        for relative, label in topic_directories.items():
            directory = root / relative
            excluded = {"README.md", "screen-inventory.md"}
            topics = [path for path in directory.glob("*.md") if path.name not in excluded]
            if not topics:
                errors.append(f"{relative} must contain at least one product-specific {label} file")
        inventory = root / "UI/screens/screen-inventory.md"
        if inventory.is_file():
            text = _read_text(inventory, errors)
            if text is not None and not FR_ID_RE.search(text):
                errors.append("UI screen inventory must reference at least one PRD requirement ID")

    if guide_type in {"dx", "hybrid"}:
        for relative in ("DX/quickstart.md", "DX/api-ergonomics.md"):
            path = root / relative
            if path.is_file():
                text = _read_text(path, errors)
                if text is not None and not FR_ID_RE.search(text):
                    errors.append(f"{relative} must reference at least one PRD requirement ID")

    return sorted(set(errors))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    args = parser.parse_args()
    errors = validate_package(args.package)
    if errors:
        print(f"Planora Product Kit validation failed ({len(errors)} error(s)):")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Planora Product Kit validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
