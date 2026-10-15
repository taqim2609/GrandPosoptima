#!/usr/bin/env python3
"""Read a Planora product package and summarize its execution state as JSON."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


TASK_RE = re.compile(
    r"^- \[(?P<checked>[ xX])\]\s+`(?P<id>(?:TASK|BUG|CHG)-\d{3})`\s+[—-]\s+(?P<title>.+)$",
    re.MULTILINE,
)
FIELD_RE = re.compile(r"^\s{2}- (?P<key>[^:]+):\s*(?P<value>.*)$", re.MULTILINE)
TASK_ID_RE = re.compile(r"\b(?:TASK|BUG|CHG)-\d{3}\b")
FR_ID_RE = re.compile(r"\b[A-Z][A-Z0-9]{1,11}-FR-\d{3}\b")
KEY_ALIASES = {
    "status": "status",
    "workflow": "workflow",
    "supporting skills": "supportingSkills",
    "skill pendukung": "supportingSkills",
    "phase": "phase",
    "fase": "phase",
    "requirements": "requirements",
    "requirement": "requirements",
    "experience": "experience",
    "pengalaman": "experience",
    "dependencies": "dependencies",
    "dependensi": "dependencies",
    "validation": "validation",
    "validasi": "validation",
    "evidence": "evidence",
    "bukti": "evidence",
}
VALID_STATUSES = {"pending", "in_progress", "blocked", "done", "skipped"}


def _clean(value: str) -> str:
    return value.strip().strip("`").strip()


def _product_path(root: Path) -> Path:
    resolved = root.expanduser().resolve()
    start = resolved.parent if resolved.name == ".planora" else resolved
    ancestors = (start, *start.parents)
    git_boundary = next((p for p in ancestors if (p / ".git").exists()), None)
    boundary = git_boundary or next(
        (p for p in ancestors if (p / "AGENTS.md").is_file() or (p / "CLAUDE.md").is_file()),
        None,
    )
    for parent in ancestors:
        candidate = parent / ".planora"
        if candidate.exists() or candidate.is_symlink():
            return candidate
        if parent == boundary:
            return candidate
    return start / ".planora"


def parse_tasks(text: str) -> list[dict[str, object]]:
    matches = list(TASK_RE.finditer(text))
    tasks: list[dict[str, object]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[match.end():end]
        fields: dict[str, str] = {}
        for field in FIELD_RE.finditer(block):
            key = KEY_ALIASES.get(field.group("key").strip().lower())
            if key:
                fields[key] = _clean(field.group("value"))
        dependencies_value = fields.get("dependencies", "")
        dependencies = TASK_ID_RE.findall(dependencies_value)
        requirements = FR_ID_RE.findall(fields.get("requirements", ""))
        tasks.append(
            {
                "id": match.group("id"),
                "title": match.group("title").strip(),
                "checked": match.group("checked").lower() == "x",
                "status": fields.get("status", "unknown"),
                "workflow": fields.get("workflow"),
                "supportingSkills": fields.get("supportingSkills"),
                "phase": fields.get("phase"),
                "requirements": requirements,
                "experience": fields.get("experience"),
                "dependencies": dependencies,
                "validation": fields.get("validation"),
                "evidence": fields.get("evidence"),
            }
        )
    return tasks


def _run_git(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )


def inspect_git(root: Path) -> dict[str, object]:
    try:
        repo = _run_git(root, "rev-parse", "--show-toplevel")
    except (FileNotFoundError, subprocess.TimeoutExpired) as error:
        return {"state": "unavailable", "reason": str(error)}
    if repo.returncode != 0:
        return {"state": "not_initialized"}

    status = _run_git(root, "status", "--short")
    tracked = _run_git(root, "ls-files")
    unstaged = _run_git(root, "diff", "--name-status")
    staged = _run_git(root, "diff", "--cached", "--name-status")
    latest = _run_git(root, "log", "-1", "--format=%H%x09%s")
    return {
        "state": "available",
        "root": repo.stdout.strip(),
        "status": [line for line in status.stdout.splitlines() if line],
        "trackedFileCount": len([line for line in tracked.stdout.splitlines() if line]),
        "unstaged": [line for line in unstaged.stdout.splitlines() if line],
        "staged": [line for line in staged.stdout.splitlines() if line],
        "latestCommit": latest.stdout.strip() if latest.returncode == 0 else None,
    }


def inspect_product(root: Path) -> dict[str, object]:
    product = _product_path(root)
    if not product.is_dir():
        return {
            "state": "invalid_package" if product.exists() or product.is_symlink() else "missing_product",
            "productPath": str(product),
            "correctiveAction": "Invoke $planora-product-kit.",
            "git": inspect_git(product.parent),
        }

    manifest_path = product / "manifest.json"
    todo_path = product / "EXECUTION" / "TODO.md"
    if not manifest_path.is_file() or not todo_path.is_file():
        missing = [str(path.relative_to(product)) for path in (manifest_path, todo_path) if not path.is_file()]
        return {
            "state": "invalid_package",
            "productPath": str(product),
            "missing": missing,
            "git": inspect_git(product.parent),
        }

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        return {
            "state": "invalid_manifest",
            "productPath": str(product),
            "error": str(error),
            "git": inspect_git(product.parent),
        }

    if not isinstance(manifest, dict) or manifest.get("formatVersion") != "1.0" or manifest.get("packageDirectory") != ".planora":
        return {
            "state": "invalid_manifest",
            "productPath": str(product),
            "error": "Expected a manifest object with formatVersion 1.0 and packageDirectory .planora",
            "git": inspect_git(product.parent),
        }

    tasks = parse_tasks(todo_path.read_text(encoding="utf-8"))
    task_by_id = {str(task["id"]): task for task in tasks}
    completed = {
        task_id
        for task_id, task in task_by_id.items()
        if task.get("status") in {"done", "skipped"}
    }
    ready = [
        task
        for task in tasks
        if task.get("status") == "pending"
        and all(dependency in completed for dependency in task.get("dependencies", []))
        and task.get("phase")
        and task.get("requirements")
    ]
    in_progress = [task for task in tasks if task.get("status") == "in_progress"]
    blocked = [task for task in tasks if task.get("status") == "blocked"]
    invalid = [task for task in tasks if task.get("status") not in VALID_STATUSES]
    blockers = manifest.get("openBlockers", []) if isinstance(manifest.get("openBlockers"), list) else []

    if invalid:
        state = "invalid_todo"
    elif in_progress:
        state = "in_progress"
    elif blockers or blocked:
        state = "blocked"
    elif ready:
        state = "ready"
    elif tasks and all(task.get("status") in {"done", "skipped"} for task in tasks):
        state = "complete"
    else:
        state = "stalled"

    counts = {status: sum(task.get("status") == status for task in tasks) for status in sorted(VALID_STATUSES)}
    counts["total"] = len(tasks)
    return {
        "state": state,
        "productPath": str(product),
        "manifestStatus": manifest.get("status"),
        "counts": counts,
        "inProgress": in_progress,
        "nextTask": ready[0] if ready else None,
        "blockedTasks": blocked,
        "openBlockers": blockers,
        "tasks": tasks,
        "git": inspect_git(product.parent),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="Project root, .planora directory, or project subdirectory")
    args = parser.parse_args()
    print(json.dumps(inspect_product(args.root), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
