# Revision workflow

Revision mode updates an existing product kit after product knowledge or decisions change. It does not revise, migrate, or implement application code.

## Entry conditions

Use revision mode only when the target contains a valid `manifest.json` with `formatVersion: 1.0`. Run the validator before editing and preserve the existing package if the baseline is structurally invalid. Ask whether to repair it first rather than silently normalizing unknown content.

## Process

1. Identify the changed source and reason: `prd`, `ui`, `dx`, or `execution`.
2. Read the current source version, affected requirement IDs, and dependent artifacts.
3. Update only documents affected by the confirmed change. Preserve stable IDs when meaning is unchanged; retire or add IDs explicitly when scope changes.
4. Run `update_revision.py` after content edits. The script bumps the selected source version, records revision metadata, refreshes the file list, and propagates stale status.
5. Reconcile stale artifacts in dependency order: PRD → UI/DX → Execution.
6. Update root README, blockers, and artifact status, then run the full validator.

## Staleness rules

- PRD change: mark UI Guide, DX Guide, and Execution Plan stale.
- UI or DX change: mark Execution Plan stale.
- Execution change: only Execution Plan becomes draft; upstream artifacts remain unchanged.
- Hybrid guide changes are independent, but either UI or DX change makes Execution stale.

A stale artifact remains readable and exportable with a visible warning; it must not be marked ready until reconciled. Do not invent a revision timestamp, author, or rationale: use the actual date and supplied reason.

## Versioning

Use `major.minor` document versions. The revision helper increments the minor component (`0.1` → `0.2`). A format-breaking package migration requires a separate format version decision and is outside ordinary revision mode.
