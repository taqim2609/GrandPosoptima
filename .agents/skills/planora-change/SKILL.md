---
name: planora-change
description: Add or revise an intentional product behavior in an existing Planora package, synchronizing PRD, UI or DX guidance, execution phases, TODO, and manifest before implementation. Use only when explicitly invoked as $planora-change.
---

# Planora Change

Turn an explicitly requested product change into a traceable revision. This skill updates product documentation and planning; it does not implement application code unless the user separately asks for implementation.

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

1. Require an existing `.planora/manifest.json`. If absent, stop and recommend `$planora-product-kit` for bootstrap.
2. Inspect the request and existing behavior. If it is solely a defect that restores already documented behavior, explain that a PRD revision is unnecessary and route implementation to `bug`, adding a `BUG-` TODO item when tracking is requested.
3. Identify affected goals, scope, feature files, requirements, acceptance criteria, UI/DX behavior, data concepts, metrics, risks, phases, and release checks.
4. Preserve stable requirement IDs when their meaning is unchanged. Add new IDs for new behavior and explicitly retire IDs whose behavior is removed.
5. Record unconfirmed business or product choices as assumptions or blockers. Do not invent user research, priority, dates, estimates, stack, vendor, or architecture.
6. Update affected artifacts in dependency order:
   - `.planora/PRD/`;
   - `.planora/UI/` and/or `.planora/DX/`;
   - `.planora/EXECUTION/phases/` and `feature-order.md`;
   - `.planora/EXECUTION/TODO.md` with new `CHG-` or `TASK-` items whose `Workflow` is `feature` for intentional product behavior, or `chore` only for behavior-preserving maintenance;
   - root product README and `manifest.json`.
7. Resolve the absolute directory containing this `SKILL.md`. When the bundled
   product-kit revision helper exists at the sibling path
   `../planora-product-kit/scripts/update_revision.py`, run:

   ```powershell
   python <resolved-sibling-path>/update_revision.py .planora --changed prd --reason "<confirmed reason>"
   ```

   Reconcile every artifact marked stale. If the helper is unavailable, preserve the same version and staleness semantics manually and disclose that path.
8. Run the bundled product-kit validator when available and fix all failures before delivery.

## Boundaries

- The user's explicit change request controls the intended behavior; existing documents are the baseline to revise.
- Do not rewrite unaffected documents or renumber stable IDs.
- Do not mark new execution items complete before implementation and validation.
- Product behavior created or revised here is implemented through `feature`. This skill supplies the updated requirements and TODO item as the handoff; it does not duplicate the feature implementation workflow.
- A product decision that materially changes the requested outcome requires user input; technical implementation details may remain "Requires technical design."
- Report changed IDs, affected artifacts, new TODO items, blockers, and whether implementation is ready to begin.
