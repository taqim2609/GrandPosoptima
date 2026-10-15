---
name: planora-next
description: Execute exactly one dependency-ready item from .planora/EXECUTION/TODO.md, verify it against PRD and UI or DX sources, and update its status and evidence. Use only when explicitly invoked as $planora-next.
---

# Planora Next

Advance a Planora execution plan by one verified work item while preserving product traceability.

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

## Select the work item

1. Require `.planora/manifest.json` and `.planora/EXECUTION/TODO.md`. If either is missing, stop and recommend `$planora-product-kit`.
2. If the user supplies a task ID, select it only when it is `pending`, `in_progress`, or `blocked` with a blocker resolved by the current request.
3. Otherwise resume the first `in_progress` item. If none exists, select the first `pending` item whose task dependencies are `done` or `skipped`.
4. Execute exactly one item per invocation. Do not silently start the next item.
5. If no task is ready, report the blocking dependencies or that the package is complete. Do not edit files.

## Execute

1. Read the selected task, its execution phase, referenced PRD feature and acceptance criteria, and applicable UI/DX documents.
2. Change its status to `in_progress` before application edits, keeping its checkbox unchecked.
3. Inspect the repository and choose implementation details from confirmed constraints and existing code. Do not infer that the PRD mandates Next.js, Convex, or another stack unless recorded.
4. Apply the general execution workflow recorded by the TODO item's `Workflow` field. Resolve the directory containing this skill, read the sibling `../<workflow>/SKILL.md`, and follow it with the selected TODO context. This internal dispatch is authorized by the explicit `$planora-next` invocation and does not require the user to invoke a second command. If an older item has no field, route it as follows:
   - `TASK-` product capability: `feature`;
   - `BUG-` defect repair: `bug`;
   - `CHG-` intentional product behavior: `feature`;
   - `CHG-` behavior-preserving maintenance: `chore`.
5. Use additional coding, backend, or design skills when the selected work requires them. Material frontend work applies `ui-design` from the referenced UI contract and finishes with `ui-review`. Use `prototype` only when the TODO explicitly names an unresolved decision. General skills provide implementation methods; PRD and UI/DX remain the product sources of truth.
   - **Isolasi Metadata PRD (Zero Technical Leaks)**:
     Saat menerjemahkan spesifikasi PRD atau wireframe ke dalam JSX/TSX:
     1. JANGAN PERNAH menyalin kode kebutuhan PRD (`*-FR-*`, `*-AC-*`, `*-NFR-*`), ID layar (`SCR-*`), ID tugas (`TASK-*`), nomor fase (`Fase XX`), nomor wireframe (`1. `, `2. `), atau path dokumen (`*.md`) ke dalam teks elemen antarmuka (badge, title, label, placeholder, toast, modal, atau docs reader).
     2. Kode-kode tersebut HANYA boleh digunakan di `data-testid`, nama unit test, komentar kode (`//`), commit git, atau catatan `TODO.md`.
6. Implement only the selected task and necessary supporting changes.
7. Run checks proportional to the task plus every validation named by its acceptance criteria and TODO record. Follow the execution skill's E2E classification and handoff policy.

## Close the item

- **Validasi Kebocoran UI**:
  Sebelum mengubah status tugas menjadi `done`:
  Jalankan pemindaian teks pada seluruh file UI yang diubah untuk memastikan 0 kebocoran regex:
  `/\b(SCR-[A-Z0-9\-]+|[A-Z]{2,10}-(FR|AC|NFR)-\d+|TASK-\d+|Fase\s+\d+)\b/`
  Jika ditemukan kebocoran pada teks antarmuka atau dokumentasi pengguna, bersihkan terlebih dahulu sebelum menutup tugas.
- On success, set status to `done`, change the checkbox to `[x]`, and replace pending evidence with concrete commands, results, or artifact references. Required E2E must pass before the item is `done`; recommended E2E may be deferred with its handoff and residual risk recorded.
- On a genuine blocker, set status to `blocked`, keep `[ ]`, record the blocker and completed partial work, and stop without choosing another task.
- On failed validation, keep `in_progress` unless progress is impossible; record the failure and continue fixing within the same item when safe.
- Update the relevant phase, release-readiness, and manifest status only when their state actually changes.
- Never weaken acceptance criteria, tests, PRD, or UI/DX guidance to declare success.

Return the task ID, requirements satisfied, files changed, validation evidence, remaining blockers, and the next task as a read-only preview.
