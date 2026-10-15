# Output contract

## Root structure

Create the package beneath the fixed path `<parent>/.planora/`:

```text
.planora/
├── README.md
├── manifest.json
├── PRD/
├── UI/          # ui or hybrid
├── DX/          # dx or hybrid
└── EXECUTION/
```

Do not derive the directory name from the product name. Do not place package files directly in a repository root. Refuse to scaffold a non-empty `.planora/` target; never merge or overwrite without explicit user authorization.

The output package is independent of any starter codebase. Do not link package documents to `apps/`, Next.js configuration, Convex files, or other repository paths unless the user explicitly requests those links. Copying the skill to another project or deleting starter application code must not break scaffold or validation.

## Naming

- Slug and generated filenames use lowercase ASCII kebab-case.
- Use semantic names. Ordinal names such as `fitur_1.md`, `feature-2.md`, or `screen_3.md` are invalid.
- Main directory names are uppercase and fixed: `PRD`, `UI`, `DX`, `EXECUTION`.
- The package directory is always lowercase `.planora`.
- Internal links are relative so the package remains portable.

## Root README

Include product summary, artifact inventory and status, source versions, generation date, critical assumptions/blockers, reading order, and a statement that human validation and technical design remain necessary.

## Manifest

Use JSON with this public shape:

```json
{
  "formatVersion": "1.0",
  "packageDirectory": ".planora",
  "project": { "id": "product-slug", "name": "Product", "locale": "id-ID" },
  "generatedDate": "YYYY-MM-DD",
  "guideType": "ui",
  "status": "draft",
  "sourceVersions": { "prd": "0.1", "uiGuide": "0.1", "executionPlan": "0.1" },
  "artifacts": {},
  "files": [],
  "openBlockers": []
}
```

For `dx`, use `dxGuide` instead of `uiGuide` in source versions and artifacts. For `hybrid`, include both. `files` lists every file in the package, including the manifest itself, exactly once using forward slashes. Artifact entries contain directory, entry file, source version, and status.

Allowed statuses are `draft`, `ready`, `blocked`, and `stale`. Do not include credentials, internal prompts, hidden reasoning, or sensitive source content that the user did not ask to export.

## Completeness

Each main directory contains a README. Create only topic files that contain product-specific content, but never omit the main PRD, experience inventory, execution TODO, feature order, release readiness, or phase 00 decisions file.

`EXECUTION/TODO.md` uses stable checklist records. Each record has a unique `TASK-`, `BUG-`, or `CHG-` ID and explicit fields for workflow, supporting skills when applicable, status, phase, requirements, experience references, dependencies, validation, and evidence. Status is one of `pending`, `in_progress`, `blocked`, `done`, or `skipped`; `[x]` is reserved for `done`.
