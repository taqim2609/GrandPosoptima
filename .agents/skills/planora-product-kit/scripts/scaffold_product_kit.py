#!/usr/bin/env python3
"""Create a safe, generic Planora Product Kit skeleton."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from datetime import date
from pathlib import Path


GUIDE_TYPES = ("ui", "dx", "hybrid")
LOCALES = ("id-ID", "en-US")


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    slug = re.sub(r"-+", "-", slug)[:64].rstrip("-")
    if not slug or slug in {".", "..", "con", "prn", "aux", "nul"}:
        raise ValueError("Project name cannot produce a safe slug")
    return slug


def _read_template(name: str, locale: str) -> str:
    template_dir = Path(__file__).resolve().parent.parent / "assets" / "templates"
    localized_name = name.replace(".md.tmpl", f".{locale}.md.tmpl")
    localized = template_dir / localized_name
    path = localized if localized.is_file() else template_dir / name
    return path.read_text(encoding="utf-8")


def _render(template: str, **values: str) -> str:
    rendered = template
    for key, value in values.items():
        rendered = rendered.replace("{{" + key + "}}", value)
    return rendered


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8", newline="\n")


def _document(target: Path, relative: str, title: str, project_name: str, locale: str) -> None:
    template_name = "content-guidelines.md.tmpl" if relative == "UI/content-guidelines.md" else "document.md.tmpl"
    content = _render(_read_template(template_name, locale), TITLE=title, PROJECT_NAME=project_name)
    _write(target / relative, content)


def _experience_directories(guide_type: str) -> list[str]:
    return [name for name in ("UI", "DX") if guide_type == "hybrid" or name.lower() == guide_type]


def scaffold(name: str, output: Path, guide_type: str, locale: str = "id-ID") -> Path:
    if guide_type not in GUIDE_TYPES:
        raise ValueError(f"guide_type must be one of: {', '.join(GUIDE_TYPES)}")
    if locale not in LOCALES:
        raise ValueError(f"locale must be one of: {', '.join(LOCALES)}")

    slug = slugify(name)
    parent = output.expanduser().resolve()
    target = parent / ".planora"
    if target.exists():
        if not target.is_dir() or any(target.iterdir()):
            raise FileExistsError(f"Refusing to overwrite non-empty target: {target}")
    target.mkdir(parents=True, exist_ok=True)

    experience_dirs = _experience_directories(guide_type)
    guide_label = "panduan pengalaman" if locale == "id-ID" else "experience guide"
    experience_links = "\n".join(
        f"- [{directory} {guide_label}]({directory}/README.md)"
        for directory in experience_dirs
    )
    root = _render(
        _read_template("root-readme.md.tmpl", locale),
        PROJECT_NAME=name,
        EXPERIENCE_LINKS=experience_links,
    )
    _write(target / "README.md", root)

    if locale == "id-ID":
        prd_documents = {
            "PRD/README.md": f"Kebutuhan produk {name}",
            "PRD/PRD.md": f"Product Requirements Document — {name}",
            "PRD/asumsi-dan-pertanyaan.md": "Asumsi, keputusan, dan pertanyaan terbuka",
            "PRD/metrik-keberhasilan.md": "Metrik keberhasilan",
            "PRD/model-data.md": "Model data konseptual",
            "PRD/non-functional-requirements.md": "Non-functional requirements",
            "PRD/roadmap.md": "Roadmap produk",
        }
    else:
        prd_documents = {
            "PRD/README.md": f"{name} product requirements",
            "PRD/PRD.md": f"Product Requirements Document — {name}",
            "PRD/asumsi-dan-pertanyaan.md": "Assumptions, decisions, and open questions",
            "PRD/metrik-keberhasilan.md": "Success metrics",
            "PRD/model-data.md": "Conceptual data model",
            "PRD/non-functional-requirements.md": "Non-functional requirements",
            "PRD/roadmap.md": "Product roadmap",
        }
    for relative, title in prd_documents.items():
        _document(target, relative, title, name, locale)
    (target / "PRD" / "fitur").mkdir(parents=True, exist_ok=True)

    if "UI" in experience_dirs:
        if locale == "id-ID":
            ui_documents = {
                "UI/README.md": f"UI Design Guide {name}",
                "UI/design-direction.md": "Arah desain",
                "UI/accessibility.md": "Aksesibilitas",
                "UI/content-guidelines.md": "Panduan konten",
                "UI/foundations/README.md": "Fondasi desain",
                "UI/components/README.md": "Standar komponen",
                "UI/patterns/README.md": "Pola interaksi",
                "UI/screens/screen-inventory.md": "Inventaris screen",
            }
        else:
            ui_documents = {
                "UI/README.md": f"{name} UI Design Guide",
                "UI/design-direction.md": "Design direction",
                "UI/accessibility.md": "Accessibility",
                "UI/content-guidelines.md": "Content guidelines",
                "UI/foundations/README.md": "Design foundations",
                "UI/components/README.md": "Component standards",
                "UI/patterns/README.md": "Interaction patterns",
                "UI/screens/screen-inventory.md": "Screen inventory",
            }
        for relative, title in ui_documents.items():
            _document(target, relative, title, name, locale)

    if "DX" in experience_dirs:
        if locale == "id-ID":
            dx_documents = {
                "DX/README.md": f"Developer Experience Guide {name}",
                "DX/experience-principles.md": "Prinsip developer experience",
                "DX/authentication-experience.md": "Pengalaman autentikasi",
                "DX/errors-and-recovery.md": "Error dan pemulihan",
                "DX/quickstart.md": "Pengalaman quickstart",
                "DX/api-ergonomics.md": "Ergonomi API",
                "DX/sdk-and-cli-guidelines.md": "Panduan SDK dan CLI",
                "DX/documentation-standards.md": "Standar dokumentasi",
                "DX/sandbox-and-testing.md": "Sandbox dan pengujian",
                "DX/observability-and-support.md": "Observability dan dukungan",
                "DX/compatibility-and-versioning.md": "Kompatibilitas dan versioning",
            }
        else:
            dx_documents = {
                "DX/README.md": f"{name} Developer Experience Guide",
                "DX/experience-principles.md": "Developer experience principles",
                "DX/authentication-experience.md": "Authentication experience",
                "DX/errors-and-recovery.md": "Errors and recovery",
                "DX/quickstart.md": "Quickstart experience",
                "DX/api-ergonomics.md": "API ergonomics",
                "DX/sdk-and-cli-guidelines.md": "SDK and CLI guidelines",
                "DX/documentation-standards.md": "Documentation standards",
                "DX/sandbox-and-testing.md": "Sandbox and testing",
                "DX/observability-and-support.md": "Observability and support",
                "DX/compatibility-and-versioning.md": "Compatibility and versioning",
            }
        for relative, title in dx_documents.items():
            _document(target, relative, title, name, locale)

    if locale == "id-ID":
        execution_documents = {
            "EXECUTION/README.md": f"Paket eksekusi {name}",
            "EXECUTION/feature-order.md": "Urutan fitur",
            "EXECUTION/release-readiness.md": "Kesiapan rilis",
        }
    else:
        execution_documents = {
            "EXECUTION/README.md": f"{name} execution package",
            "EXECUTION/feature-order.md": "Feature order",
            "EXECUTION/release-readiness.md": "Release readiness",
        }
    for relative, title in execution_documents.items():
        _document(target, relative, title, name, locale)
    todo = _render(_read_template("todo.md.tmpl", locale), PROJECT_NAME=name)
    _write(target / "EXECUTION/TODO.md", todo)
    phase_title = "Fase 00 — Keputusan produk" if locale == "id-ID" else "Phase 00 — Product decisions"
    phase = _render(_read_template("phase.md.tmpl", locale), TITLE=phase_title)
    _write(target / "EXECUTION/phases/phase-00-decisions.md", phase)

    manifest_path = target / "manifest.json"
    files = sorted(
        ["manifest.json"]
        + [path.relative_to(target).as_posix() for path in target.rglob("*") if path.is_file()]
    )
    source_versions = {"prd": "0.1", "executionPlan": "0.1"}
    artifacts: dict[str, dict[str, str]] = {
        "prd": {"directory": "PRD", "entry": "PRD/PRD.md", "sourceVersion": "0.1", "status": "draft"},
        "executionPlan": {"directory": "EXECUTION", "entry": "EXECUTION/README.md", "sourceVersion": "0.1", "status": "draft"},
    }
    if "UI" in experience_dirs:
        source_versions["uiGuide"] = "0.1"
        artifacts["uiGuide"] = {"directory": "UI", "entry": "UI/README.md", "sourceVersion": "0.1", "status": "draft"}
    if "DX" in experience_dirs:
        source_versions["dxGuide"] = "0.1"
        artifacts["dxGuide"] = {"directory": "DX", "entry": "DX/README.md", "sourceVersion": "0.1", "status": "draft"}

    manifest = {
        "formatVersion": "1.0",
        "packageDirectory": ".planora",
        "project": {"id": slug, "name": name, "locale": locale},
        "generatedDate": date.today().isoformat(),
        "guideType": guide_type,
        "status": "draft",
        "sourceVersions": source_versions,
        "artifacts": artifacts,
        "files": files,
        "openBlockers": ["__PLANORA_REQUIRED__"],
    }
    _write(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2))
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True, help="Human-readable product name")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path.cwd(),
        help="Repository root or parent directory; the package is always created at <output>/.planora",
    )
    parser.add_argument("--guide-type", choices=GUIDE_TYPES, required=True)
    parser.add_argument("--locale", choices=LOCALES, default="id-ID")
    args = parser.parse_args()
    try:
        target = scaffold(args.name, args.output, args.guide_type, args.locale)
    except (ValueError, FileExistsError, OSError) as error:
        parser.exit(2, f"error: {error}\n")
    print(target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
