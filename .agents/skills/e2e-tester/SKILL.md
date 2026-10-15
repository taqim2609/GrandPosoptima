---
name: e2e-tester
description: Run approved browser-based end-to-end validation for a completed or review-ready feature, maintenance change, or bug fix. Use when the user invokes /e2e-tester, asks to execute an E2E handoff, or explicitly requests browser validation of a user journey.
---

# E2E Tester

Validate real user journeys through the browser and report observable evidence. This skill is intentionally separated from implementation workflows so users can enable the required browser capability and run token-intensive validation in a dedicated task.

This workflow uses the browser automation already provided by the coding agent.
Do not install or run Playwright, Cypress, or another test framework as part of
this workflow. A separate request for persistent automated browser tests is a
different task and does not replace the agent-driven browser validation here.

## Authorization and Boundaries

- An explicit `/e2e-tester <spec-path>` invocation or direct request to run a
  named browser E2E spec authorizes the scenarios in that file.
- Do not ask for a second confirmation unless the test requires production access, a paid action, sending real messages, deleting data, or another consequential external side effect.
- Use local or development environments and dedicated test accounts by default. Never test against production without explicit authorization.
- Do not broaden the test beyond the handoff, acceptance criteria, or user request without explaining why.
- This workflow validates the implementation. Do not silently repair product code when a scenario fails; capture the failure and recommend `/bug`. Small test-only setup changes are allowed when clearly necessary and reported.

## Preconditions

1. Read the repository-level agent rules and relevant project documentation.
2. Read the supplied `specs/e2e/*.md` handoff, relevant acceptance criteria,
   and the completed implementation summary recorded in the repository. If no
   path is supplied, use the only pending spec when exactly one exists;
   otherwise ask the user to point to the intended file.
3. Inspect existing E2E documentation, fixtures, and test-account conventions,
   but keep execution in the host agent's browser capability.
4. Confirm that browser automation is available. Use Codex's built-in browser
   when running in Codex. On Antigravity, use its Chrome Dev browser capability
   after the user opens Chrome and enables access.
5. Confirm the target environment, start command, base URL, test account, fixtures, and any required credentials.

If browser automation or a required credential is unavailable, stop before claiming validation. Report the exact missing prerequisite and preserve the scenario list for the next attempt.

## Execution Workflow

1. Translate the handoff into a short checklist of observable browser scenarios.
2. Start or connect to the approved local or development application using the repository's documented command.
3. Establish isolated test data and accounts where practical. Avoid modifying unrelated user data.
4. Execute each scenario through the browser, including its critical success path and specified negative or edge cases.
5. Record evidence for every scenario: URL or route, actions, expected result,
   and actual result. Attach a screenshot or video for every critical user
   journey when the browser capability provides it. On Antigravity, preserve
   the Chrome Dev screenshots or recording it produces. On Codex, preserve
   browser screenshots or other available visual evidence. Store the artifact
   path or attachment reference in the spec and report.
6. Check the browser console and relevant application or backend logs when a scenario fails or emits unexpected behavior.
7. Clean up temporary test data when cleanup is safe and supported.
8. Classify the result as `Passed`, `Failed`, or `Blocked` using the rules below.
9. Update the spec status and append dated evidence for each executed scenario.
   Preserve prior evidence instead of replacing it without explanation.
10. Report the result with the format below. Update project tracking only when required by the calling workflow or repository rules, and mark validation complete only when every required scenario passes.

## Result Rules

- `Passed`: every required scenario completed with matching observable results and no unresolved critical console or application errors.
- `Failed`: at least one scenario produced behavior that contradicts its acceptance criterion.
- `Blocked`: a prerequisite, environment failure, unavailable browser capability, or missing credential prevented a meaningful result.

A partial pass is not a full pass. List successful scenarios separately, but use `Failed` or `Blocked` for the overall result when any required scenario is unresolved.

Visual evidence is part of a complete report for browser-visible journeys. If
the host cannot capture screenshots or video, use the strongest available trace
or log and explicitly report the media limitation; do not imply that visual
evidence was attached.

## E2E Report Format

### Target

- Feature, chore, or bug: [name or execution item]
- Spec: [`specs/e2e/<work-id-or-semantic-slug>.md`]
- Environment: [local or development]
- Base URL: [URL]

### Result

- Overall: [Passed | Failed | Blocked]
- Required scenarios: [count]
- Passed: [count]
- Failed: [count]
- Blocked: [count]

### Scenario Evidence

1. [Scenario name]
   - Actions: [browser actions]
   - Expected: [observable result]
   - Actual: [observable result]
   - Evidence: [screenshot, trace, log, or concise observation]
   - Status: [Passed | Failed | Blocked]

### Findings

- [Defect, console error, accessibility blocker, or unexpected behavior]

### Media Evidence

- [Screenshot or video path/attachment for each critical user journey]
- [If unavailable, state the browser limitation and substitute evidence]

### Recommended Next Step

- On pass: [state that the E2E acceptance evidence is complete]
- On failure: [invoke `/bug` with the reproduction and evidence]
- When blocked: [enable the browser/plugin, provide the missing prerequisite, and rerun `/e2e-tester`]
