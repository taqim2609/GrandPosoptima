# Execution planning

## Required execution package

```text
EXECUTION/
├── README.md
├── TODO.md
├── feature-order.md
├── release-readiness.md
└── phases/
    ├── phase-00-decisions.md
    └── <one semantic file per phase>.md
```

## Ordering method

1. Put unresolved product, policy, data, or experience decisions in phase 00.
2. Identify prerequisites such as identity, ownership, persistence, and core domain state.
3. Build the smallest end-to-end vertical slice that proves the primary user outcome.
4. Add safe editing, recovery, versioning, quality, and derived artifacts only after their source is stable.
5. Add export/integration after artifact contracts stabilize.
6. Finish with security, accessibility, performance, operational readiness, and staged release evidence.

Do not order features only by their numbering. Explain dependency edges and meaningful parallel work.

## Live TODO ledger

`TODO.md` is the operational source of truth for implementation status. Each checklist item includes a unique `TASK-`, `BUG-`, or `CHG-` ID, a `Workflow` field, PRD requirement IDs, UI/DX references when applicable, phase, dependencies, current status, validation, and evidence. Use `feature` for new or intentionally changed product behavior, `bug` for restoring expected behavior, and `chore` for behavior-preserving maintenance. Add specialized skills such as design, backend, or `e2e-tester` only when the work requires them. Material UI implementation items use `ui-design` and validate with `ui-review`. Add `prototype` only when an important UI decision is intentionally unresolved, `animate` only when motion is required, and `ask-sonner` only for Sonner toast behavior. Allowed status values are `pending`, `in_progress`, `blocked`, `done`, and `skipped`. Use `[x]` only with `done`; every other status uses `[ ]`. Update the item when work starts, becomes blocked, or completes. Never mark an item complete based only on code presence; its acceptance criteria and required checks must pass.

## Phase contract

Every phase file includes:

- outcome;
- dependencies;
- included PRD requirement IDs and UI/DX references;
- execution workflows and applicable specialized skills;
- ordered work;
- failure or rollback considerations where relevant;
- measurable exit criteria.

Do not invent sprint counts, dates, estimates, assignees, stack, or vendor choices. Mark missing technical decisions as **Requires technical design**. A phase with an unresolved P0 dependency is `blocked`, not ready.

## Release readiness

Cover product acceptance, AI evaluation when applicable, security/privacy, data deletion, reliability, accessibility, compatibility, analytics, observability, support, rollout, and rollback. Accepted risks require an owner and rationale.
