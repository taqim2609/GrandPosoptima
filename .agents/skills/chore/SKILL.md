---
name: chore
description: Plan and perform maintenance or edits to an existing application without intentionally adding new product behavior. Use for refactors, copy or style adjustments, dependency maintenance, configuration changes, file organization, and other bounded codebase upkeep.
---

# Chore

Use this workflow for bounded maintenance that preserves the intended product behavior. It follows a plan, execute, test, validate, and report cycle so routine edits can be completed with minimal user back-and-forth.

## Workflow

1. Read the repository-level agent rules and relevant project documentation.
2. Inspect the affected code and its callers, tests, and configuration.
3. Confirm that the request is a chore. Route new product behavior to `feature` and defect repair to `bug`.
4. Identify documented or tested behavior that the maintenance must preserve.
5. Produce a concise plan using the format below. Continue in the same task unless a material decision or permission is required.
6. Make the smallest coherent change and preserve existing behavior outside the stated scope.
7. Run targeted tests plus relevant static or build checks.
8. Apply the E2E policy below.
9. Update project tracking only when the calling workflow or repository rules require it.
10. Report the edits, evidence, remaining risk, and E2E handoff when applicable.

## Implementation Rules

- Use concrete paths, symbols, and commands; do not leave placeholders in the executed plan.
- Prefer existing project patterns and avoid opportunistic refactors.
- Preserve public behavior unless the user explicitly requests a behavior change. If behavior must change, reroute the work to `feature`.
- Install dependencies with the repository's existing package manager and only when necessary.
- Inspect relevant files beyond the initially named file when needed to prevent regressions.
- Use applicable specialized skills and technology-specific instructions required by the repository.
- Do not use browser requests or `curl` as a substitute for E2E validation of interactive UI behavior.

## E2E Policy

Classify browser E2E as `Required`, `Recommended`, or `Not needed` during planning. Most internal maintenance should be `Not needed`. Recommend E2E when the chore changes rendered UI, navigation, forms, authentication surfaces, client-side state, or configuration that affects a browser flow.

E2E is deferred by default. Complete the chore and non-E2E checks, then provide an **E2E Handoff** for a separate `/e2e-tester` task. Run it in the same task only when the user explicitly requested E2E and browser automation is available.

When E2E is `Required` or `Recommended`, create or update
`specs/e2e/<work-id-or-semantic-slug>.md`. The spec must record the target,
source request, recommendation, `Pending` status, environment, prerequisites,
ordered browser scenarios with expected results, and an empty evidence section.
Use this file—not chat history—as the cross-session handoff.

If required browser capability is unavailable, report E2E as blocked or pending; never claim it passed. A required E2E check prevents full validation. A recommended deferred check is a documented residual risk.

## Plan Format

### Chore Description

[Describe the maintenance objective and the behavior that must remain unchanged.]

### Scope

- In scope: [files, systems, or maintenance outcome]
- Out of scope: [boundaries]

### Relevant Files

- `[path]`: [why it matters and the intended edit]

### Implementation Tasks

1. [Concrete task]
   - [Implementation detail]
   - [Regression risk]

### Testing Strategy

- Static checks: [commands or checks]
- Unit or integration tests: [cases]
- Regression checks: [existing behavior to preserve]

### E2E Assessment

- Recommendation: [Required | Recommended | Not needed]
- Reason: [risk or affected browser behavior]
- Scenarios: [short numbered scenario list, or `None`]
- Preconditions: [accounts, fixtures, browser/plugin, environment]
- Execution: [Deferred to `/e2e-tester` by default, or explicitly requested in this task]

### Validation Commands

- `[command]`: [what a successful result proves]

### Completion Criteria

- [Requested maintenance outcome]
- [Preserved behavior and regression checks]
- [Required documentation or project tracking synchronized when applicable]
- [Required E2E passes, or is explicitly reported as pending]

## E2E Handoff Format

Include this block in the final response whenever E2E is `Required` or `Recommended`:

- Target: [chore or execution item]
- Recommendation: [Required | Recommended]
- Scenarios: [ordered browser scenarios]
- Preconditions: [setup, account, seed data, browser/plugin]
- Start command: [how to run the app]
- Spec: [`specs/e2e/<work-id-or-semantic-slug>.md`]
- Run next: `/e2e-tester specs/e2e/<work-id-or-semantic-slug>.md`
