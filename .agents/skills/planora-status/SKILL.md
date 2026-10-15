---
name: planora-status
description: Inspect the fixed product package and report execution progress, blockers, and the next dependency-ready task without modifying files. Use only when explicitly invoked as $planora-status.
---

# Planora Status

Provide a concise, evidence-based answer to "what is the status?" or "what should be done next?" for a Planora product package.

## Package location

Use `.planora/` at the project root. From the working directory, inspect ancestors
for the nearest `.planora/`, stopping at the nearest Git repository root (`.git`
file or directory). Without Git, stop at the nearest root containing `AGENTS.md`
or `CLAUDE.md`. Inspect the boundary itself. An existing invalid package is an
error; do not skip it to select a parent package. If no package exists, readers
report it missing without creating files. For creation, use the discovered root,
or the working directory when no root marker exists, unless the user explicitly
specifies another parent. Pass that absolute parent as scaffold `--output`;
`--output` always means the parent, never the package directory.

## Workflow

1. Resolve the repository root from the current working directory and locate `.planora/`.
2. Run the bundled read-only inspector:

   ```powershell
   python <skill-directory>/scripts/inspect_product.py --root <repository-root>
   ```

3. If the package is missing or structurally invalid, report that state and the exact corrective action. Do not create or repair files.
4. Read `.planora/EXECUTION/TODO.md`, the phase for the next task, and its referenced PRD/UI/DX documents when more context is needed.
5. When the repository uses Git, inspect `git status --short`, staged and
   unstaged `git diff --name-status`, tracked files, and the latest commit. Use
   relevant diffs as evidence of what changed, but never infer completion from
   a diff alone. If Git is unavailable or not initialized, disclose that state.
6. Report:
   - overall package state and task counts;
   - any current `in_progress` task;
   - active blockers;
   - the first dependency-ready task and why it is ready;
   - its `Workflow` and supporting skills;
   - tasks that cannot proceed because dependencies are incomplete.

## Constraints

- This skill is strictly read-only. Never change TODO status, product documents, application code, or Git state.
- Treat `done` and `skipped` dependencies as satisfied. Treat `blocked` and incomplete dependencies as unsatisfied.
- If an `in_progress` task exists, recommend resuming it before selecting a new task unless the user explicitly asks to reprioritize.
- Do not infer completion from code presence. Use the recorded status and evidence.
- Do not claim a task is ready when its requirement, phase, or dependency reference cannot be resolved.
