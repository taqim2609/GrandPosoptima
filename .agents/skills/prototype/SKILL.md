---
name: prototype
description: Create and compare genuinely different UI prototypes for one unresolved visual or interaction decision before production implementation. Use only when explicitly invoked as $prototype or when a tracked Planora item explicitly lists prototype as a supporting skill.
---

# Prototype

Make an unresolved design decision visible before production code commits to it.

1. Read the product requirement and existing UI contract. Identify the single
   decision the prototypes must explore and the constraints that remain fixed.
2. Produce two or three meaningfully different alternatives. Vary composition,
   hierarchy, density, or interaction model—not only colors and radius.
3. Keep product content, approved palette, typography roles, accessibility, and
   required behavior consistent across alternatives.
4. Build in an isolated preview location or temporary workspace. Do not replace
   production UI or update the approved design source before selection.
5. Verify each alternative renders at representative desktop and mobile sizes
   when browser capability is available.
6. Present the alternatives with concise tradeoffs and ask the user to select
   one. Stop before production implementation.
7. Record the selected direction in the calling design source or task only when
   that workflow authorizes the update. Implementation returns to `feature` or
   the calling workflow.

Do not prototype when the UI contract already resolves the decision. Do not
invent a new brand, product claim, or feature while exploring composition.
