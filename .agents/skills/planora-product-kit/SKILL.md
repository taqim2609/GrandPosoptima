---
name: planora-product-kit
description: Create a complete, traceable product-planning package with PRD, UI or DX guidance, and dependency-ordered execution documents. Use only when explicitly invoked as $planora-product-kit for a new or revised product concept; do not use for ordinary document edits, technical design, or application implementation.
---

# Planora Product Kit

Turn a product idea into a decision-transparent package that product, design, and engineering can use without treating AI assumptions as facts.

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

## Required outcome

Create one self-contained `.planora/` directory under the user's requested repository root or parent directory, or the current working directory by default. This directory name is fixed for every product so repository instructions and other skills can use stable paths. The package must contain:

- `README.md` and `manifest.json` at its root;
- `PRD/` with the main PRD, supporting documents, and one semantic kebab-case file per feature;
- `UI/` for products with a user interface, `DX/` for API-only products, or both for hybrid products;
- `EXECUTION/` with a live `TODO.md`, feature order, release readiness, and one file per delivery phase.

Always produce the complete package. Do not silently switch to PRD-only output.

## Workflow

1. Inspect the user's prompt, attachments, and relevant existing product documents. Preserve unrelated files.
2. Read [intake and provenance](references/intake-and-provenance.md) and [output contract](references/output-contract.md).
3. If the target already contains a Planora manifest, read [revision workflow](references/revision-workflow.md) and use revision mode. Otherwise use create mode.
4. Classify the experience as `ui`, `dx`, or `hybrid`. Ask when the platform cannot be determined from evidence.
5. Build a context ledger containing Facts, Assumptions, Decisions, and Open Questions. Ask no more than three high-impact questions per round. Start generation only after the user confirms the summary or explicitly accepts a draft with visible assumptions.
6. Read [PRD authoring](references/prd-authoring.md), then author the PRD and feature files with stable requirement IDs.
7. Read [experience guide](references/experience-guide.md), then author the required UI/DX guide. For hybrid products, author both.
8. Read [execution planning](references/execution-planning.md), then order delivery by dependencies and testable vertical slices. Assign each execution item a general workflow such as `feature`, `bug`, or `chore`, plus any applicable specialized design, backend, or testing skills.
9. Create or update the root README and manifest only after the artifact set is final.
10. Read [quality gates](references/quality-gates.md), run the validator, and correct every failure before delivery.

## Scaffold and validate

Resolve the absolute directory containing this `SKILL.md`; call it `<skill-directory>`. Never assume the current working directory is the skill directory.

Use the bundled scaffold for a new package:

```powershell
python <skill-directory>/scripts/scaffold_product_kit.py --name "Product Name" --output <absolute-project-root> --guide-type ui --locale id-ID
```

The scaffold always targets `<output>/.planora` and refuses that directory when it is non-empty. It intentionally creates `__PLANORA_REQUIRED__` markers that must all be replaced with product-specific content.
Use the locale-matching feature template in `assets/templates/` when adding each semantic feature file so the required stable IDs and sections are not omitted.

After revising existing artifacts, update versions and dependent stale states:

```powershell
python <skill-directory>/scripts/update_revision.py <path-to-product-kit> --changed prd --reason "Scope updated after stakeholder review"
```

Validate the finished package:

```powershell
python <skill-directory>/scripts/validate_product_kit.py <path-to-product-kit>
```

## Non-negotiable constraints

- Use evidence from the user or inspected sources. Do not invent research, business facts, stack choices, vendors, dates, estimates, or team capacity.
- Label unconfirmed inferences as assumptions and unresolved decisions as open questions or blockers.
- Keep PRD requirements focused on what, why, constraints, and measurable outcomes. Mark implementation choices as requiring technical design.
- Use semantic filenames such as `structured-interview.md`; never use `fitur_1.md` or equivalent ordinal names.
- Keep requirement IDs stable and trace UI/DX specifications and execution phases back to them.
- Traceability isolation: Never leak technical specification codes (`[SCR-xxx]`, `[*-FR-xxx]`, `[*-AC-xxx]`, `[TASK-xxx]`, phase numbers, internal `.md` document paths, or wireframe ordinal numbers like `1. `) into user-facing mockup copy, labels, badges, placeholders, or descriptions. Technical IDs belong strictly in metadata tables, frontmatter, testing IDs, code comments, or developer notes.
- Documentation standards: Specifications for user-facing documentation modules (such as tutorial readers) must never place PRD requirement codes or badges in the reader UI. Traceability remains strictly in tests or internal validation metadata.
- Maintain `.planora/EXECUTION/TODO.md` as the live implementation ledger. A task may be marked complete only after its acceptance criteria and validation evidence pass.
- Keep product planning separate from execution mechanics. Generated execution items reference portable skills such as `feature`, `bug`, `chore`, and `e2e-tester`; Planora supplies their requirements, ordering, and tracking context.
- A UI guide is a professional design specification, not a high-fidelity mockup or production code. A DX guide is an API consumer experience specification, not an API implementation.
- Do not overwrite an existing non-empty target or unrelated repository files without explicit authorization.
- The skill may live inside a starter containing Next.js, Convex, or an `apps/` directory, but it has no runtime dependency on that code. Treat an inspected stack as repository evidence, not a PRD decision, unless the user confirms it as a constraint.
- Never modify application code while generating or revising a product kit. The skill must remain usable if the user copies only this skill or deletes the starter's `apps/` directory.
