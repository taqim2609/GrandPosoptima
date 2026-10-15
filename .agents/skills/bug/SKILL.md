---
name: bug
description: Diagnose and repair a reproducible defect in an existing application. Use when actual behavior differs from expected behavior, an error occurs, a regression is reported, or the user asks for root-cause analysis and a fix.
---

# Bug

Use this workflow to reproduce a defect, identify its root cause, apply the smallest safe repair, and prove that the reported failure is gone without creating avoidable regressions.

## Workflow

1. Read the repository-level agent rules and relevant project documentation.
2. Establish expected behavior from the user request, specifications, tests, or existing behavior.
3. Reproduce the failure when feasible and capture the command, state, and observed result. If reproduction is unsafe or impossible, state the limitation and use the strongest available evidence.
4. Trace the relevant code, including callers, data flow, configuration, and recent or adjacent behavior.
5. Confirm that the request is a bug. If the desired outcome introduces new product behavior rather than restoring expected behavior, route it to `feature`.
6. Produce a concise repair plan using the format below. Continue in the same task unless a missing decision, credential, external side effect, or destructive action requires user input.
7. Implement a surgical fix at the root cause. Avoid unrelated cleanup.
8. Add or update a regression test when practical, then run targeted tests and relevant static or build checks.
9. Repeat the original reproduction and apply the E2E policy below.
10. Update project tracking only when the calling workflow or repository rules require it and the evidence supports the new status.
11. Report the root cause, fix, verification evidence, remaining risks, and E2E handoff when applicable.

## Repair Rules

- Distinguish symptoms from the underlying cause before editing code.
- Keep the patch minimal while fixing the complete failure path.
- Preserve API contracts and user-visible behavior outside the documented fix.
- Do not weaken validation, authorization, types, or tests merely to make the failure disappear.
- Install dependencies with the repository's existing package manager and only when necessary.
- Inspect relevant files beyond the initially named file when needed to validate the diagnosis.
- Use applicable specialized skills and technology-specific instructions required by the repository.
- Never claim a bug is fixed without evidence that distinguishes the repaired behavior from the original failure.

## E2E Policy

Classify browser E2E as `Required`, `Recommended`, or `Not needed` during planning. E2E is usually required when the defect can only be reproduced at the browser boundary or when its acceptance criterion explicitly demands browser evidence. It is recommended when the repair affects an important user journey but lower-level tests also cover the root cause.

E2E is deferred by default. Complete the repair, regression test, and non-E2E verification, then provide an **E2E Handoff** for a separate `/e2e-tester` task. Run browser E2E in the same task only when the user explicitly requested it and browser automation is available.

When E2E is `Required` or `Recommended`, create or update
`specs/e2e/<work-id-or-semantic-slug>.md`. The spec must record the defect or
task, expected behavior source, recommendation, `Pending` status, environment,
prerequisites, reproduction and adjacent regression scenarios with expected
results, and an empty evidence section. Use this file—not chat history—as the
cross-session handoff.

If required browser capability is unavailable, report the repair as implemented but not fully validated. Never replace missing browser evidence with an unsupported claim. A recommended deferred check should be recorded as residual risk.

## Plan Format

### Bug Description

[Describe the expected behavior, actual behavior, impact, and affected users or systems.]

### Reproduction

1. [Setup or precondition]
2. [Action]
3. [Observed failure]

### Root Cause

[Explain the failing code path and the evidence supporting the diagnosis.]

### Relevant Files

- `[path]`: [role in the defect and intended repair]

### Repair Tasks

1. [Concrete task]
   - [Implementation detail]
   - [Regression risk]

### Testing Strategy

- Regression test: [case that fails before and passes after]
- Static checks: [commands or checks]
- Unit or integration tests: [related cases]
- Reproduction after repair: [expected result]

### E2E Assessment

- Recommendation: [Required | Recommended | Not needed]
- Reason: [browser-bound failure or journey risk]
- Scenarios: [reproduction and adjacent regression scenarios, or `None`]
- Preconditions: [accounts, fixtures, browser/plugin, environment]
- Execution: [Deferred to `/e2e-tester` by default, or explicitly requested in this task]

### Validation Commands

- `[command]`: [what a successful result proves]

### Completion Criteria

- [Original defect no longer reproduces]
- [Regression coverage passes]
- [Related behavior remains intact]
- [Required E2E passes, or is explicitly reported as pending]

## E2E Handoff Format

Include this block in the final response whenever E2E is `Required` or `Recommended`:

- Target: [bug or execution item]
- Recommendation: [Required | Recommended]
- Scenarios: [ordered browser scenarios]
- Preconditions: [setup, account, seed data, browser/plugin]
- Start command: [how to run the app]
- Spec: [`specs/e2e/<work-id-or-semantic-slug>.md`]
- Run next: `/e2e-tester specs/e2e/<work-id-or-semantic-slug>.md`
