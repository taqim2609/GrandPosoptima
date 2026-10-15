from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("planora_status", SKILL_ROOT / "scripts/inspect_product.py")
if spec is None or spec.loader is None:
    raise RuntimeError("Cannot load inspector")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def task(task_id: str, status: str, dependency: str = "none", checked: str = " ") -> str:
    return f"""- [{checked}] `{task_id}` — Work
  - Status: `{status}`
  - Workflow: `feature`
  - Supporting skills: `e2e-tester`
  - Phase: `phase-01`
  - Requirements: `APP-FR-001`
  - Experience: `UI/screens/app.md`
  - Dependencies: {dependency}
  - Validation: tests pass
  - Evidence: pending
"""


class InspectProductTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_product(self, todo: str, blockers: list[str] | None = None) -> None:
        product = self.root / ".planora"
        (product / "EXECUTION").mkdir(parents=True)
        (product / "manifest.json").write_text(
            json.dumps({"formatVersion": "1.0", "packageDirectory": ".planora", "status": "draft", "openBlockers": blockers or []}), encoding="utf-8"
        )
        (product / "EXECUTION/TODO.md").write_text(todo, encoding="utf-8")

    def test_resolves_root_subdirectory_and_package(self) -> None:
        self.write_product(task("TASK-001", "pending"))
        (self.root / "AGENTS.md").touch()
        nested = self.root / "apps" / "src"
        nested.mkdir(parents=True)
        for path in (self.root, nested, self.root / ".planora"):
            result = module.inspect_product(path)
            self.assertEqual(result["state"], "ready")
            self.assertEqual(Path(result["productPath"]), self.root / ".planora")

    def test_project_boundaries_prevent_parent_package_selection(self) -> None:
        self.write_product(task("TASK-001", "pending"))
        for marker in (".git", "AGENTS.md", "CLAUDE.md"):
            child = self.root / marker.replace(".", "_")
            child.mkdir()
            (child / marker).touch()
            nested = child / "apps"
            nested.mkdir()
            result = module.inspect_product(nested)
            self.assertEqual(result["state"], "missing_product")
            self.assertEqual(Path(result["productPath"]), child / ".planora")
            self.assertFalse((child / ".planora").exists())

    def test_git_boundary_takes_precedence_over_nested_agent_rules(self) -> None:
        self.write_product(task("TASK-001", "pending"))
        (self.root / ".git").mkdir()
        nested = self.root / "apps"
        nested.mkdir()
        (nested / "AGENTS.md").touch()
        self.assertEqual(module.inspect_product(nested)["state"], "ready")

    def test_invalid_nearest_package_is_not_skipped(self) -> None:
        self.write_product(task("TASK-001", "pending"))
        child = self.root / "apps"
        child.mkdir()
        target = child / ".planora"
        target.write_text("keep", encoding="utf-8")
        self.assertEqual(module.inspect_product(child)["state"], "invalid_package")
        self.assertEqual(target.read_text(), "keep")
        target.unlink()
        target.mkdir()
        self.assertEqual(module.inspect_product(child)["state"], "invalid_package")

    def test_invalid_manifests_are_reported_without_writes(self) -> None:
        self.write_product(task("TASK-001", "pending"))
        manifest = self.root / ".planora/manifest.json"
        for body in ("{", "[]", '{"formatVersion":"1.0","packageDirectory":"wrong"}'):
            manifest.write_text(body, encoding="utf-8")
            self.assertEqual(module.inspect_product(self.root)["state"], "invalid_manifest")
            self.assertEqual(manifest.read_text(), body)

    def test_missing_product(self) -> None:
        self.assertEqual(module.inspect_product(self.root)["state"], "missing_product")

    def test_selects_first_dependency_ready_task(self) -> None:
        self.write_product(task("TASK-001", "done", checked="x") + task("TASK-002", "pending", "`TASK-001`"))
        result = module.inspect_product(self.root)
        self.assertEqual(result["state"], "ready")
        self.assertEqual(result["nextTask"]["id"], "TASK-002")
        self.assertEqual(result["nextTask"]["workflow"], "feature")
        self.assertEqual(result["nextTask"]["supportingSkills"], "e2e-tester")

    def test_resumes_in_progress_before_pending(self) -> None:
        self.write_product(task("TASK-001", "in_progress") + task("TASK-002", "pending"))
        result = module.inspect_product(self.root)
        self.assertEqual(result["state"], "in_progress")
        self.assertEqual(result["inProgress"][0]["id"], "TASK-001")

    def test_reports_blocker(self) -> None:
        self.write_product(task("TASK-001", "blocked"), ["Decision required"])
        result = module.inspect_product(self.root)
        self.assertEqual(result["state"], "blocked")
        self.assertEqual(result["openBlockers"], ["Decision required"])

    def test_reports_git_changes_when_repository_is_initialized(self) -> None:
        self.write_product(task("TASK-001", "pending"))
        subprocess.run(["git", "init"], cwd=self.root, check=True, capture_output=True)
        changed = self.root / "changed.txt"
        changed.write_text("work in progress\n", encoding="utf-8")
        result = module.inspect_product(self.root)
        self.assertEqual(result["git"]["state"], "available")
        self.assertIn("?? changed.txt", result["git"]["status"])


if __name__ == "__main__":
    unittest.main()
