---
name: pick-ui-library
description: Compare and recommend a frontend library for one clearly defined UI primitive or interaction when the current project does not already provide it. Use only when explicitly invoked as $pick-ui-library; do not install the selection without separate implementation authorization.
---

# Pick UI Library

Recommend a dependency only after proving the project needs one.

1. Define the required primitive, framework/runtime constraints, accessibility
   needs, bundle sensitivity, theming model, maintenance expectations, and
   required server/client compatibility.
2. Inspect installed dependencies and local components first. Prefer an existing
   accessible primitive that satisfies the requirement.
3. Consult version-current official documentation for viable candidates.
4. Compare at most three candidates using evidence relevant to this project:
   capability fit, accessibility, ownership/customization, bundle/runtime cost,
   maintenance, license, and integration risk.
5. Recommend one candidate or recommend no new dependency. State the tradeoff
   that determined the result.
6. Do not install, configure, or rewrite components unless the user or calling
   implementation workflow separately authorizes that work.

This skill selects a tool; it does not choose product behavior or visual
identity.
