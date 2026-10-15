# Intake and provenance

## Context ledger

Maintain four categories throughout generation:

- **Fact:** supplied by the user or supported by an inspected source.
- **Assumption:** a useful inference that has not been confirmed.
- **Decision:** explicitly confirmed by the user or an authoritative project document.
- **Open question:** missing information that materially affects scope, behavior, risk, or success criteria.

Never promote an assumption or open question to a fact without evidence.

## Intake categories

Extract what is already known before asking questions:

- problem and current workaround;
- target users and excluded users;
- desired outcome and business goal;
- product and platform type;
- primary flows and must-have capabilities;
- success measures and baselines;
- privacy, security, regulatory, device, browser, or integration constraints;
- brand context and existing design system;
- time, budget, team, and technology constraints explicitly supplied by the user.

An existing repository may provide evidence about current implementation, but it does not automatically turn its framework or backend into a product requirement. In a bundled starter, treat Next.js, Convex, and the presence of `apps/` as optional implementation context unless the user explicitly makes them constraints. Do not require `apps/` to exist.

Ask only questions whose answers materially change the package. Prefer up to three mutually exclusive choices per round when choices are meaningful. Explain the impact of a recommended option. Do not ask questions already answered by repository evidence.

## Experience classification

- `ui`: the product's primary consumers use a graphical web, mobile, or desktop interface. Generate `UI/`.
- `dx`: the product is API-only, infrastructure, SDK, CLI, or another developer-facing interface without an end-user graphical UI. Generate `DX/`.
- `hybrid`: the product has both a substantial graphical experience and developer-facing API/SDK experience. Generate both `UI/` and `DX/`.

If classification is ambiguous, ask before scaffolding because it changes the public output contract.

## Generation gate

Before writing output, present a compact summary of facts, decisions, assumptions, and critical open questions. Proceed when either:

1. the user confirms the summary; or
2. the user explicitly requests a draft despite open questions.

In case 2, retain the open questions and mark affected execution phases as blocked. Never imply that market need or product-market fit has been validated solely by the interview.
