---
name: feature
description: Plan and implement a new product feature in an existing application. Use when the user asks to add new user-visible behavior, a new workflow, or a capability that changes what the product can do.
---

# Feature

Use this workflow to add a new product capability with a deliberate plan, focused implementation, proportionate testing, and an explicit E2E decision. The goal is to complete a well-defined feature without repeatedly asking the user for routine implementation decisions.

## Workflow

1. Read the repository-level agent rules and relevant project documentation.
2. Inspect the relevant implementation, callers, tests, and configuration before proposing changes.
3. Establish the requested outcome and acceptance criteria from the user request and any project-specific source supplied by the calling workflow.
4. Confirm that the request is a feature. Route defect repair to `bug` and behavior-preserving maintenance to `chore`.
5. Do not silently invent missing product requirements. Ask only when a missing decision would materially change the outcome; otherwise state reasonable implementation assumptions.
6. Produce a concise implementation plan using the format below. Continue in the same task unless a missing product decision, credential, external side effect, or destructive action requires user input.
7. Implement the feature using existing project patterns. Keep the change cohesive and avoid unrelated refactors.
8. Run the smallest sufficient set of static checks, unit tests, integration tests, and build checks.
9. Apply the E2E policy below.
10. Update project tracking only when the calling workflow or repository rules require it, using evidence produced by the completed work.
11. Report what changed, what was verified, any remaining risks, and the E2E handoff when applicable.

## Implementation Rules

- Replace every placeholder in the plan with concrete, repository-specific information.
- Reuse existing abstractions and conventions before introducing new ones.
- Design shared code for reuse only when the current feature has a real shared use case.
- Install dependencies with the package manager already used by the repository. Do not change package managers.
- Read relevant files beyond the initial list when required to understand imports, data flow, authorization, tests, or regressions.
- Use applicable specialized skills and technology-specific instructions required by the repository.
- Never claim completion based only on code inspection when runnable verification is available.

## E2E Policy

During planning, classify browser E2E validation as `Required`, `Recommended`, or `Not needed`.

- `Required`: use for a primary user journey, authentication, authorization,
  payments or money calculations, consequential state transitions, or any
  acceptance criterion that requires browser proof.
- `Recommended`: the default for every other user-visible feature. Browser
  validation should confirm that the completed behavior also works through the
  intended UI and UX, not only in code or lower-level tests.
- `Not needed`: reserve for changes with no meaningful browser-visible behavior
  whose outcomes are fully covered below the browser boundary.

Prepare the E2E handoff after the relevant static, unit, integration, business
logic, negative, and edge-case checks pass. Do not use E2E as a substitute for
those checks; use it to validate the assembled user journey through the UI.

E2E is deferred by default. Finish implementation and non-E2E verification, then include an **E2E Handoff** in the final response for a separate `/e2e-tester` task. This keeps the workflow reliable on agents that require a browser plugin to be enabled in a new session.

When E2E is `Required` or `Recommended`, create or update a persistent Markdown
spec at `specs/e2e/<work-id-or-semantic-slug>.md`. Use a tracked task or issue ID
when one exists. The spec must contain the target and source requirement,
recommendation, `Pending` status, environment, prerequisites, ordered browser
scenarios with expected results, and an empty evidence section. This file is
the handoff across sessions; do not rely on chat history alone.

Run E2E in the same task only when the user explicitly requested it and browser automation is available. An explicit `/e2e-tester` invocation counts as authorization to run the described browser scenarios. Never simulate or claim browser evidence when the required capability is unavailable.

If E2E is `Required`, the feature may be implementation-complete but must be reported as not fully validated until E2E passes. If it is merely `Recommended`, record the deferred validation as a residual risk rather than treating the implementation as failed.

## Plan Format

### Feature Description

[Describe the capability and its user-visible outcome.]

### User Story

As a [user type], I want [capability] so that [benefit].

### Requirements

- Source: [user request, issue, specification, execution item, or other calling context]
- Acceptance criteria: [traceable criteria]
- Out of scope: [boundaries]

### Relevant Files

- `[path]`: [why it matters and the intended change]

### Implementation Tasks

1. [Concrete task]
   - [Implementation detail]
   - [Dependency or risk]

### Testing Strategy

- Static checks: [commands or checks]
- Unit tests: [cases]
- Integration tests: [flows and boundaries]
- Negative and edge cases: [cases]

### E2E Assessment

- Recommendation: [Required | Recommended | Not needed]
- Reason: [risk or browser-visible behavior]
- Scenarios: [short numbered scenario list, or `None`]
- Preconditions: [accounts, fixtures, browser/plugin, environment]
- Execution: [Deferred to `/e2e-tester` by default, or explicitly requested in this task]

### Validation Commands

- `[command]`: [what a successful result proves]

### Completion Criteria

- [Observable product behavior]
- [Required automated checks pass]
- [Required documentation or project tracking is synchronized when applicable]
- [Required E2E passes, or is explicitly reported as pending]

## E2E Handoff Format

Include this block in the final response whenever E2E is `Required` or `Recommended`:

- Target: [feature, issue, or execution item]
- Recommendation: [Required | Recommended]
- Scenarios: [ordered browser scenarios]
- Preconditions: [setup, account, seed data, browser/plugin]
- Evidence requested: [screenshots or video for the critical user journeys]
- Start command: [how to run the app]
- Spec: [`specs/e2e/<work-id-or-semantic-slug>.md`]
- Run next: `/e2e-tester specs/e2e/<work-id-or-semantic-slug>.md`
