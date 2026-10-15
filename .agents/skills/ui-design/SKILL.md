---
name: ui-design
description: Apply an existing UI or design contract while implementing a material frontend change. Use for pages, components, forms, navigation, responsive layouts, visual states, and design-system work; preserve the approved identity and use ui-review for critique-only requests.
---

# UI Design

Translate an approved product experience into cohesive production UI without
replacing the selected implementation workflow. `feature`, `bug`, or `chore`
owns scope and execution; this skill supplies frontend design decisions.

## Source of truth

1. Read repository rules and the design sources named by the calling workflow.
2. In a Planora package, read the relevant files under `.planora/UI/`, including
   design direction, foundations, components, patterns, and screen specs.
3. Treat confirmed product content and behavior as fixed. Existing code is
   implementation evidence, not permission to contradict the design contract.
4. If no design contract exists, preserve coherent existing conventions and
   state the minimum design assumptions needed for the task. Do not create a
   parallel `PRODUCT.md`, `DESIGN.md`, brand, or palette.

## Workflow

1. Identify the screen purpose, primary user action, required states, target
   viewports, and referenced acceptance criteria.
2. Write a compact **UI implementation contract** in the calling plan:
   - identity and semantic color roles;
   - typography and density;
   - layout hierarchy and primary action;
   - reusable components and interaction states;
   - responsive, accessibility, imagery, and motion constraints;
   - explicit anti-patterns from the design source.
3. Read [craft foundations](references/craft-foundations.md) and apply only the
   rules compatible with the approved identity.
4. Read [style profiles](references/style-profiles.md) only when the design
   source or user clearly selects one of those profiles. Never blend profiles
   merely to make the result look more designed.
5. Reuse the project's tokens and components. Introduce a dependency only when
   the required accessible primitive does not already exist.
6. Implement every relevant state: default, hover, focus, active, disabled,
   loading, empty, error, and success. Include explicit mobile behavior.
7. When a material composition decision remains unresolved, stop before
   production UI and recommend `/prototype`. Do not generate variants when the
   design source already made the decision.
8. Use `animate` only when the design contract or interaction requires motion.
   Use `ask-sonner` for Sonner-specific toast work. Recommend
   `/pick-ui-library` only when selecting a new dependency is the actual task.
9. After implementation and normal code checks, apply `ui-review` to material
   UI changes. Browser E2E remains governed by the repository E2E policy.

## Boundaries

- Preserve the approved palette, typography roles, shape language, density,
  imagery direction, and motion character.
- Derived tints and shades must stay within the approved semantic color family.
- The 60:30:10 color model is a hierarchy heuristic, not a pixel quota; status,
  contrast, and focus colors may override it for usability.
- Do not add gradients, glass, bento grids, oversized headings, floating badges,
  or animation simply because they are fashionable.
- Do not rewrite requirements or silently turn a focused UI change into a
  redesign.
- Visual review is not E2E evidence.
