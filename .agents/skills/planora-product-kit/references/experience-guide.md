# UI and DX experience guides

Generate the guide only after the PRD is coherent enough to serve as its source. Record the PRD version and mark the guide stale when a material source change affects it.

## UI guide

Create `UI/` for `ui` and `hybrid` products. Include:

```text
UI/
├── README.md
├── design-direction.md
├── accessibility.md
├── content-guidelines.md
├── foundations/
├── components/
├── patterns/
└── screens/
    └── screen-inventory.md
```

The guide must translate users, flows, requirements, platform, brand context, and NFRs into:

- experience goals, brand attributes, design principles, and anti-patterns;
- semantic colors, typography roles, spacing/layout, radius/elevation, imagery/iconography, and motion;
- a recognizable identity signature with at least three inspectable decisions
  that distinguish the product from generic AI-generated interfaces;
- a dominant/supporting/accent color hierarchy using 60:30:10 as a visual
  heuristic, with explicit semantic status, contrast, and focus exceptions;
- surface density, card/container policy, primary-action emphasis, and layout
  families appropriate to each screen type;
- component anatomy, variants, states, content rules, responsive behavior, and accessibility;
- navigation, forms, validation, feedback, destructive actions, loading, empty/error/success states, and AI interaction patterns;
- a screen inventory and screen specifications traced to PRD requirement IDs.

Mark unconfirmed visual choices as **Design assumptions**. Do not use adjectives such as professional, modern, or intuitive without inspectable rules. Do not generate Figma files, production code, or claim unverified WCAG compliance.

Do not make current AI trends the default identity. Gradients, glass effects,
bento grids, oversized display type, floating badges, generated imagery, and
decorative motion require support from the confirmed direction or product use
case. Specify what the design intentionally avoids so implementation and review
can detect drift.

### Pemisahan Metadata vs Salinan UI (Traceability Isolation)

Saat menyusun spesifikasi layar, wireframe teks, atau panduan komponen:
- **Aturan**: Kode identitas teknis (`[SCR-xxx]`, `[*-FR-xxx]`, `[*-AC-xxx]`, `[TASK-xxx]`) hanya boleh diletakkan di **tabel metadata/frontmatter**, **ID pengujian**, atau **catatan developer**. Dilarang keras menaruhnya di dalam blok teks salinan antarmuka (*mockup UI copy*).
- **Standar Penulisan Wireframe**:
  - ❌ *Salah*: `Badge: [SCR-POS-01] Kasir POS`
  - ❌ *Salah*: `Label: 1. OMZET`
  - ❌ *Salah*: `Deskripsi: Input tanpa me-reset form transaksi (CUST-AC-003)`
  - ✔️ *Benar*:
    - Metadata Tabel: `Layar: SCR-POS-01 | Syarat Terkait: CUST-AC-003`
    - Salinan UI:
      - `Badge: Kasir POS`
      - `Label: Total Omzet`
      - `Deskripsi: Input transaksi cepat tanpa mengosongkan nota yang sedang dibuat.`

### Klausul Wajib di `UI/content-guidelines.md` (UI Copy Hygiene)

Panduan konten wajib menyertakan klausul eksplisit:
> **Pemisahan Metadata Developer dan Salinan UI (UI Copy Hygiene)**:
> Antarmuka aplikasi dan panduan pengguna (docs) ditujukan untuk pemilik usaha dan staf gerai / pengguna akhir. Seluruh kode pelacakan PRD, kode fitur, ID layar, penomoran urutan wireframe, dan nomor fase dilarang keras muncul dalam label, badge, placeholder, toast, modal, maupun teks panduan.

### Standar Khusus Dokumentasi Pengguna (`/docs`)

Spesifikasi modul panduan pengguna (seperti `docs-tutorial-reader.md` / `CHG-001`) tidak boleh mencantumkan badge kebutuhan PRD di UI pembaca panduan (`docs-reader.tsx`). Pelacakan PRD untuk dokumentasi cukup disimpan di unit test atau skrip validasi internal.

## DX guide

Create `DX/` for `dx` and `hybrid` products. Include:

```text
DX/
├── README.md
├── experience-principles.md
├── authentication-experience.md
├── errors-and-recovery.md
├── quickstart.md
├── api-ergonomics.md
├── sdk-and-cli-guidelines.md
├── documentation-standards.md
├── sandbox-and-testing.md
├── observability-and-support.md
└── compatibility-and-versioning.md
```

Specify consumer-facing behavior rather than implementation: first-success journey, credential safety, naming consistency, pagination/idempotency expectations, error taxonomy, retry guidance, examples, SDK parity, CLI behavior, sandbox fidelity, request correlation, deprecation, and migration communication.

Trace DX rules to PRD requirements. Do not invent actual endpoints, payload fields, authentication protocols, SDK languages, SLAs, or versioning strategy unless the user supplied or confirmed them.

## Hybrid products

Generate both directories. Keep shared terminology, status semantics, authentication concepts, and versioning policy consistent. Document handoffs between graphical and developer journeys, such as creating credentials in UI and consuming them through an API.
