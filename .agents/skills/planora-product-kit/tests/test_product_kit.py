from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, relative: str):
    spec = importlib.util.spec_from_file_location(name, SKILL_ROOT / relative)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {relative}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


scaffold_module = load_module("planora_scaffold", "scripts/scaffold_product_kit.py")
validator_module = load_module("planora_validator", "scripts/validate_product_kit.py")
revision_module = load_module("planora_revision", "scripts/update_revision.py")


FEATURE = """# Structured interview

## Purpose

Collect missing context.

## User stories

- As a user, I can clarify my idea.

## Functional requirements

- `INT-FR-001` — Present one structured question.

## Acceptance criteria

- `INT-AC-001` — A valid answer is saved once.

## Edge cases

- A response is interrupted.
"""


class ProductKitTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.parent = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def finish_package(self, package: Path, guide_type: str) -> Path:
        for path in package.rglob("*.md"):
            text = path.read_text(encoding="utf-8").replace(
                "__PLANORA_REQUIRED__", "Konten spesifik produk yang telah dikonfirmasi."
            )
            path.write_text(text, encoding="utf-8", newline="\n")
        (package / "PRD/PRD.md").write_text(
            """# Product Requirements Document

## Ringkasan
Ringkasan produk.
## Latar belakang dan masalah
Masalah pengguna.
## Tujuan
Tujuan produk.
## Non-goals
Batas produk.
## Target pengguna
Pengguna utama.
## Scope
Ruang lingkup MVP.
## Risiko
Risiko produk.
## Definition of done
Kriteria selesai.
""",
            encoding="utf-8",
            newline="\n",
        )
        feature = package / "PRD/fitur/structured-interview.md"
        feature.write_text(FEATURE, encoding="utf-8", newline="\n")
        phase = package / "EXECUTION/phases/phase-01-core-workflow.md"
        phase.write_text(
            """# Phase 01 — Core workflow

## Outcome
Primary flow works.
## Dependencies
Phase 00 decisions.
## Requirements and experience references
`INT-FR-001`
## Execution workflows
`feature`
## Work
Implement the vertical slice.
## Exit criteria
The primary flow passes validation.
""",
            encoding="utf-8",
            newline="\n",
        )
        (package / "EXECUTION/TODO.md").write_text(
            """# Execution TODO — Test Product

## Status legend

- `[ ]` — not started
- `[x]` — completed and verified

## Execution checklist

- [ ] `TASK-001` — Implement structured interview
  - Status: `pending`
  - Workflow: `feature`
  - Phase: `phase-01`
  - Requirements: `INT-FR-001`
  - Experience: `UI/screens/dashboard.md`
  - Dependencies: none
  - Validation: acceptance criteria and tests pass
  - Evidence: pending

## Active blockers

- None.

## Decision notes

- Decisions are recorded in phase 00.
""",
            encoding="utf-8",
            newline="\n",
        )
        if guide_type in {"ui", "hybrid"}:
            ui_files = {
                "UI/foundations/colors.md": "# Colors\n\nSemantic color roles.\n",
                "UI/components/buttons.md": "# Buttons\n\nButton states and behavior.\n",
                "UI/patterns/forms.md": "# Forms\n\nValidation and recovery patterns.\n",
                "UI/screens/dashboard.md": "# Dashboard\n\nSupports `INT-FR-001`.\n",
            }
            for relative, body in ui_files.items():
                path = package / relative
                path.write_text(body, encoding="utf-8", newline="\n")
            inventory = package / "UI/screens/screen-inventory.md"
            inventory.write_text(
                inventory.read_text(encoding="utf-8") + "\nSupports `INT-FR-001`.\n",
                encoding="utf-8",
                newline="\n",
            )
        if guide_type in {"dx", "hybrid"}:
            for relative in ("DX/quickstart.md", "DX/api-ergonomics.md"):
                path = package / relative
                path.write_text(
                    path.read_text(encoding="utf-8") + "\nSupports `INT-FR-001`.\n",
                    encoding="utf-8",
                    newline="\n",
                )
        manifest_path = package / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["openBlockers"] = []
        manifest["files"] = sorted(
            ["manifest.json"]
            + [
                path.relative_to(package).as_posix()
                for path in package.rglob("*")
                if path.is_file() and path != manifest_path
            ]
        )
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        return package

    def create_finished(self, guide_type: str = "ui") -> Path:
        package = scaffold_module.scaffold("Test Product", self.parent, guide_type)
        return self.finish_package(package, guide_type)

    def test_scaffold_rejects_file_target_without_changes(self) -> None:
        target = self.parent / ".planora"
        target.write_text("keep", encoding="utf-8")
        with self.assertRaises(FileExistsError):
            scaffold_module.scaffold("Test", self.parent, "ui")
        self.assertEqual(target.read_text(), "keep")

    def test_scaffold_guide_locale_matrix(self) -> None:
        for guide in ("ui", "dx", "hybrid"):
            for locale in ("id-ID", "en-US"):
                parent = self.parent / (guide + locale)
                package = scaffold_module.scaffold("Test", parent, guide, locale)
                manifest = json.loads((package / "manifest.json").read_text(encoding="utf-8"))
                self.assertEqual(package.name, ".planora")
                self.assertEqual(manifest["packageDirectory"], ".planora")
                self.assertEqual(manifest["project"]["locale"], locale)
                self.assertEqual((package / "UI").exists(), guide in ("ui", "hybrid"))
                self.assertEqual((package / "DX").exists(), guide in ("dx", "hybrid"))
                self.assertEqual(list(parent.iterdir()), [package])

    def test_revision_rejects_invalid_contract_without_writes(self) -> None:
        package = self.create_finished()
        path = package / "manifest.json"
        for body in ("[]", '{"formatVersion":"1.0","packageDirectory":"wrong"}'):
            path.write_text(body, encoding="utf-8")
            with self.assertRaises(ValueError):
                revision_module.update_revision(package, "prd", "Test")
            self.assertEqual(path.read_text(), body)
        path.write_text('{"formatVersion":"1.0","packageDirectory":".planora"}', encoding="utf-8")
        renamed = package.rename(self.parent / "incorrect")
        with self.assertRaises(ValueError):
            revision_module.update_revision(renamed, "prd", "Test")

    def test_validator_rejects_non_object_manifest(self) -> None:
        package = self.create_finished()
        (package / "manifest.json").write_text("[]", encoding="utf-8")
        self.assertIn("manifest must be a JSON object", validator_module.validate_package(package))

    def test_package_revision_and_status_integration(self) -> None:
        package = self.create_finished("hybrid")
        revision_module.update_revision(package, "prd", "Confirmed requirements")
        self.assertEqual(validator_module.validate_package(package), [])
        inspector = load_module("integration_status", "../planora-status/scripts/inspect_product.py")
        result = inspector.inspect_product(package)
        self.assertEqual(result["state"], "ready")
        self.assertEqual(result["nextTask"]["id"], "TASK-001")

    def test_slug_is_safe_and_normalized(self) -> None:
        self.assertEqual(scaffold_module.slugify("../../Mý Product!"), "my-product")

    def test_scaffold_rejects_nonempty_target(self) -> None:
        target = self.parent / ".planora"
        target.mkdir()
        (target / "existing.txt").write_text("keep", encoding="utf-8")
        with self.assertRaises(FileExistsError):
            scaffold_module.scaffold("Test Product", self.parent, "ui")

    def test_hybrid_scaffold_creates_both_guides(self) -> None:
        package = scaffold_module.scaffold("Hybrid Product", self.parent, "hybrid")
        self.assertTrue((package / "UI/README.md").is_file())
        self.assertTrue((package / "DX/README.md").is_file())

    def test_scaffold_always_uses_static_product_directory(self) -> None:
        package = scaffold_module.scaffold("Any Product Name", self.parent, "ui")
        self.assertEqual(package, (self.parent / ".planora").resolve())
        manifest = json.loads((package / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["packageDirectory"], ".planora")

    def test_scaffold_localizes_indonesian_by_default(self) -> None:
        package = scaffold_module.scaffold("Produk Lokal", self.parent, "ui")
        self.assertIn("# Paket produk", (package / "README.md").read_text(encoding="utf-8"))
        manifest = json.loads((package / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["project"]["locale"], "id-ID")

    def test_scaffold_supports_english_locale(self) -> None:
        package = scaffold_module.scaffold("English Product", self.parent, "dx", "en-US")
        self.assertIn("# English Product product kit", (package / "README.md").read_text(encoding="utf-8"))
        manifest = json.loads((package / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["project"]["locale"], "en-US")

    def test_finished_packages_validate(self) -> None:
        for guide_type in ("ui", "dx", "hybrid"):
            with self.subTest(guide_type=guide_type):
                parent = self.parent / guide_type
                parent.mkdir()
                package = scaffold_module.scaffold("Valid Product", parent, guide_type)
                self.finish_package(package, guide_type)
                self.assertEqual(validator_module.validate_package(package), [])

    def test_revision_bumps_prd_and_marks_dependents_stale(self) -> None:
        package = self.create_finished("hybrid")
        manifest = revision_module.update_revision(package, "prd", "Scope changed")
        self.assertEqual(manifest["sourceVersions"]["prd"], "0.2")
        self.assertEqual(manifest["artifacts"]["prd"]["status"], "draft")
        self.assertEqual(manifest["artifacts"]["uiGuide"]["status"], "stale")
        self.assertEqual(manifest["artifacts"]["dxGuide"]["status"], "stale")
        self.assertEqual(manifest["artifacts"]["executionPlan"]["status"], "stale")
        self.assertEqual(manifest["revisionHistory"][-1]["reason"], "Scope changed")
        self.assertEqual(validator_module.validate_package(package), [])

    def test_revision_rejects_missing_artifact(self) -> None:
        package = self.create_finished("ui")
        with self.assertRaises(ValueError):
            revision_module.update_revision(package, "dx", "DX requested")

    def test_validator_detects_missing_file(self) -> None:
        package = self.create_finished()
        (package / "PRD/PRD.md").unlink()
        errors = validator_module.validate_package(package)
        self.assertTrue(any("missing" in error and "PRD/PRD.md" in error for error in errors))

    def test_validator_rejects_nonstatic_package_directory(self) -> None:
        package = self.create_finished()
        renamed = self.parent / "renamed-product-kit"
        package.rename(renamed)
        errors = validator_module.validate_package(renamed)
        self.assertIn("package directory must use the fixed name: .planora", errors)

    def test_validator_detects_invalid_package_directory_manifest(self) -> None:
        package = self.create_finished()
        manifest_path = package / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["packageDirectory"] = "other"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        errors = validator_module.validate_package(package)
        self.assertIn("manifest packageDirectory must be .planora", errors)

    def test_validator_detects_untraceable_todo(self) -> None:
        package = self.create_finished()
        (package / "EXECUTION/TODO.md").write_text(
            "# TODO\n\n## Execution checklist\n\nNo tasks yet.\n",
            encoding="utf-8",
        )
        errors = validator_module.validate_package(package)
        self.assertTrue(any("TODO.md" in error for error in errors))

    def test_validator_requires_compatible_todo_workflow(self) -> None:
        package = self.create_finished()
        todo = package / "EXECUTION/TODO.md"
        todo.write_text(
            todo.read_text(encoding="utf-8").replace(
                "  - Workflow: `feature`", "  - Workflow: `bug`"
            ),
            encoding="utf-8",
        )
        errors = validator_module.validate_package(package)
        self.assertTrue(any("TASK-001 cannot use Workflow `bug`" in error for error in errors))

    def test_validator_detects_broken_link(self) -> None:
        package = self.create_finished()
        readme = package / "README.md"
        readme.write_text(readme.read_text(encoding="utf-8") + "\n[Broken](missing.md)\n", encoding="utf-8")
        errors = validator_module.validate_package(package)
        self.assertTrue(any("broken relative link" in error for error in errors))

    def test_validator_detects_ordinal_filename(self) -> None:
        package = self.create_finished()
        ordinal = package / "PRD/fitur/fitur_1.md"
        ordinal.write_text(FEATURE, encoding="utf-8")
        manifest_path = package / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["files"].append("PRD/fitur/fitur_1.md")
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        errors = validator_module.validate_package(package)
        self.assertTrue(any("ordinal filename" in error for error in errors))

    def test_validator_detects_duplicate_manifest_entry(self) -> None:
        package = self.create_finished()
        manifest_path = package / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["files"].append(manifest["files"][0])
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        errors = validator_module.validate_package(package)
        self.assertIn("manifest files contains duplicate entries", errors)

    def test_validator_detects_invalid_artifact_contract(self) -> None:
        package = self.create_finished()
        manifest_path = package / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["artifacts"].pop("uiGuide")
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        errors = validator_module.validate_package(package)
        self.assertTrue(any("manifest artifacts must be exactly" in error for error in errors))

    def test_validator_rejects_unsafe_artifact_entry(self) -> None:
        package = self.create_finished()
        manifest_path = package / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["artifacts"]["prd"]["entry"] = "../outside.md"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        errors = validator_module.validate_package(package)
        self.assertTrue(any("unsafe manifest artifact entry" in error for error in errors))

    def test_validator_rejects_windows_absolute_artifact_entry(self) -> None:
        package = self.create_finished()
        manifest_path = package / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["artifacts"]["prd"]["entry"] = "C:/outside.md"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        errors = validator_module.validate_package(package)
        self.assertTrue(any("unsafe manifest artifact entry" in error for error in errors))

    def test_validator_detects_duplicate_requirement_id(self) -> None:
        package = self.create_finished()
        second = package / "PRD/fitur/second-feature.md"
        second.write_text(FEATURE.replace("# Structured", "# Second"), encoding="utf-8")
        manifest_path = package / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["files"].append("PRD/fitur/second-feature.md")
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        errors = validator_module.validate_package(package)
        self.assertTrue(any("duplicate requirement ID" in error for error in errors))

    def test_validator_detects_unbalanced_fence(self) -> None:
        package = self.create_finished()
        readme = package / "README.md"
        readme.write_text(readme.read_text(encoding="utf-8") + "\n```text\n", encoding="utf-8")
        errors = validator_module.validate_package(package)
        self.assertTrue(any("unbalanced fenced" in error for error in errors))

    def test_validator_detects_template_marker(self) -> None:
        package = self.create_finished()
        readme = package / "README.md"
        readme.write_text(readme.read_text(encoding="utf-8") + "\n__PLANORA_REQUIRED__\n", encoding="utf-8")
        errors = validator_module.validate_package(package)
        self.assertTrue(any("unresolved template marker" in error for error in errors))

    def test_validator_detects_unlisted_file(self) -> None:
        package = self.create_finished()
        (package / "unlisted.md").write_text("# Unlisted\n", encoding="utf-8")
        errors = validator_module.validate_package(package)
        self.assertIn("file missing from manifest: unlisted.md", errors)


if __name__ == "__main__":
    unittest.main()
