---
name: animate
description: Implement purposeful motion for a specific frontend interaction when the approved UI contract or user request requires animation. Use for transitions, feedback, spatial continuity, and gesture behavior; not for general UI redesign or read-only motion audits.
---

# Animate

Implement the smallest motion that makes an interaction clearer or more
responsive.

1. Read the applicable UI contract and existing motion tokens.
2. Name the purpose: feedback, spatial continuity, state indication, explanation,
   or prevention of a jarring change. If none applies, do not add animation.
3. Consider frequency. High-frequency and keyboard-driven actions should be
   instant or nearly imperceptible; reserve expressive motion for rare moments.
4. Prefer the cheapest suitable mechanism: CSS transition, `@starting-style`,
   CSS animation, Web Animations API, then an existing motion library for
   interruptible gestures or layout transitions.
5. Extend existing duration/easing tokens. Do not add a parallel motion system
   or dependency for a simple effect.
6. Prefer `transform` and `opacity`; avoid layout-triggering properties unless
   the behavior cannot be expressed otherwise.
7. Make rapid or gesture-driven motion interruptible and preserve spatially
   consistent entry and exit paths.
8. Ship reduced-motion behavior and gate hover-only effects for hover-capable
   pointers.
9. Verify the interaction, interruption, mobile behavior, and relevant console
   output. Do not claim visual quality from source inspection alone.

Motion must preserve function and reading stability. Never add perpetual motion,
scroll hijacking, or decoration to information-dense application surfaces by
default.
