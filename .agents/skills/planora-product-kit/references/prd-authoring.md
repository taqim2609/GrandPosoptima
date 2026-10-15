# PRD authoring

## Required PRD package

Create at minimum:

```text
PRD/
├── README.md
├── PRD.md
├── asumsi-dan-pertanyaan.md
├── metrik-keberhasilan.md
├── model-data.md
├── non-functional-requirements.md
├── roadmap.md
└── fitur/
    └── <semantic-feature-name>.md
```

Use the output language requested by the user; default to Bahasa Indonesia.

## Main PRD

Cover summary, problem, vision, goals, non-goals, users, jobs to be done, product principles, primary flow, prioritized scope, cross-feature requirements, product states, risks, dependencies, launch strategy, and definition of done.

Separate constraints that affect the product from solution choices. A PRD may require response time, security outcome, supported platform, or integration capability. It must not invent frameworks, physical database schemas, algorithms, endpoint payloads, cloud vendors, or deployment topology.

## Feature files

Each feature file must include purpose, user stories, functional requirements, acceptance criteria, edge cases, and analytics events where meaningful.

Use stable IDs:

- `<FEATURE>-FR-001` for functional requirements;
- `<FEATURE>-AC-001` for acceptance criteria.

Keep the prefix short, unique, and unchanged across revisions. Acceptance criteria must describe observable outcomes rather than restating implementation steps.

### Traceability isolation (Zero technical leaks)

Requirement IDs (`<FEATURE>-FR-001`, `<FEATURE>-AC-001`), screen IDs (`SCR-*`), and task IDs (`TASK-*`) are strictly metadata identifiers for developer tracking and test specifications. They must NEVER be placed in user-facing copy, wireframe element labels, badges, button texts, or user stories prose.

Contoh:
- ❌ Salah: `Header: [SCR-POS-01] Kasir POS`, `Label: 1. OMZET`, `Tombol: Simpan (CUST-AC-003)`
- ✔️ Benar: Pisahkan metadata ke tabel/frontmatter (`Layar: SCR-POS-01 | Syarat: CUST-AC-003`), dan tulis salinan UI secara bersih (`Header: Kasir POS`, `Label: Total Omzet`, `Tombol: Simpan`).

## Supporting documents

- Assumptions/open questions distinguish decisions from hypotheses and include validation methods.
- Metrics define formulas, population, window, target status, and guardrails; never fabricate a baseline.
- Conceptual data model describes product entities and integrity rules, not implementation tables.
- NFRs define measurable performance, reliability, security, privacy, accessibility, compatibility, and observability outcomes.
- Roadmap is outcome-based and must not invent dates or capacity.

## Quality rubric

Verify that every Must feature addresses a user problem, has testable acceptance criteria, and appears in the primary flow or has an explicit reason not to. Goals connect to metrics; risks connect to mitigations; assumptions remain visibly unconfirmed; scope and non-goals do not conflict.
Verify that technical tracking codes (`SCR-*`, `FR-*`, `AC-*`, `TASK-*`, phase numbers, wireframe ordinal numbers) never leak into mock UI copy, badges, labels, or user-facing documentation text.
