# Quality gates

## Content gate

- Facts, assumptions, decisions, and open questions remain distinct.
- No fabricated research, baseline, regulatory claim, stack, vendor, estimate, or deadline.
- Goals map to metrics; Must features map to user needs and acceptance criteria.
- Requirement IDs are unique and stable.
- UI/DX specifications and execution phases trace to PRD IDs.
- Traceability isolation & UI copy hygiene: Technical identifiers (`SCR-*`, `*-FR-*`, `*-AC-*`, `*-NFR-*`, `TASK-*`, phase numbers, internal `.md` paths, and wireframe numbers) must never appear inside mock UI copy, button labels, badge text, placeholders, or user-facing descriptions. Documentation specifications must not place PRD requirement badges in user-facing reader interfaces.
- Experience guides cover relevant states, accessibility or developer recovery, and source-version staleness.
- Execution phases follow dependencies and each has measurable exit criteria.

## File gate

- Root README and manifest exist.
- The package directory is named `.planora`, and the manifest declares `packageDirectory: .planora`.
- `EXECUTION/TODO.md` contains traceable checklist items and PRD requirement references.
- Guide directories match `guideType`.
- Every Markdown file starts with one H1 and has balanced fenced blocks.
- Relative Markdown links resolve inside the package.
- Filenames are semantic kebab-case; ordinal feature names are forbidden.
- No `__PLANORA_REQUIRED__` or unresolved `{{TOKEN}}` markers remain.
- Manifest file entries exactly match files on disk, with no duplicates.

## Validation

Run:

```powershell
python scripts/validate_product_kit.py <package-path>
```

Treat any nonzero exit as a blocking failure. Fix the content or package rather than weakening the validator for a single output.

After automated checks, manually inspect the primary flow, at least one Must feature, the experience inventory, the first delivery slice, and all listed blockers. Report remaining assumptions and human reviews required.
