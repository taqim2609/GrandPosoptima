# Rebrand Google Cloud / AI Studio to VPS Mandiri & Auto Database Sync

Completely eliminate all user-facing and backend references to Google Cloud and Google AI Studio across the entire codebase, replacing them with **VPS Mandiri** / **Server Utama (Lokal/Cloud VPS)**. Enable automatic database sync and backup updates to the VPS database alongside the confirmed Google Drive backup integration.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following updated requirements incorporate the latest user revision requests:

- **Decision 1 (Complete Terminology Cleansing)**: Remove all remaining occurrences of "Google Cloud" and "Google AI Studio" in both frontend components (`SettingsInstaller`, `AssistantAI`, `WhatsApp`, `Diagnostik`, `Login`, `Dashboard`, `lib/installers`) and backend responses (`api-server.js`). Replace with "Server VPS Mandiri" or "Server Utama".
- **Decision 2 (VPS Automatic Database Sync)**: Configure auto-sync and backup triggers so database updates are automatically dispatched to the VPS server database (`/api/backup/send-to-vps` / VPS Primary Node sync) upon shift close and scheduled backups.
- **Decision 3 (Google Drive Retention)**: Retain Google Drive backup options (`GDriveBackupManager`), allowing store owners to maintain both VPS automatic database sync and Google Drive cloud archives.

---

## 1. Overview & Core Concept

- **What It Does**: Rebrands the entire update center, diagnostic tools, login server selectors, and installer scripts from Google Cloud / AI Studio to VPS Mandiri / Server Utama. Connects automated database sync directly to the user's VPS database.
- **Target Audience / Persona**: POS administrators, cashiers, and store managers operating on local PC or Raspberry Pi connected to a dedicated VPS Server.
- **Key Value**: Delivers a seamless, self-hosted POS experience with clean terminology and dual redundancy (VPS Auto-Sync + Google Drive Backup).

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Settings / Installer**: Header changed to "Pusat Update Server VPS Mandiri", removing AI Studio badges. Scripts rebranded to VPS & Raspberry Pi node installers.
  2. **Automatic Database Sync**: Shift close & manual backup actions show progress: *"Mengirim update database ke VPS Mandiri & Google Drive..."*
  3. **Diagnostics & Health Panel**: Server health benchmarks rebranded to "Node Kasir LAN" vs "Server VPS Utama".
  4. **Login Server Selector**: Display mode labels changed from "Google Cloud" to "Server VPS Utama (Internet)".

- **Visual Identity & Theme**:
  - *Palette*: Emerald (`#10B981`), Indigo (`#4F46E5`), Red (`#E63946`), Slate (`#0F172A`).
  - *Typography*: Clean Sans-serif with monospace tabular numerals for version, IP, and sync logs.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct VPS Auto-Sync Endpoint**:
  - *Chosen Approach*: Update `/api/backup/send-to-cloud` route alias to `/api/backup/send-to-vps` and wire it to dispatch database snapshots to the configured VPS host.
  - *Why*: Satisfies "otomatis update ke database di vps juga" without breaking existing button handler bindings.
- **Decision 2: Comprehensive Codebase Audit**:
  - *Chosen Approach*: Systematically update string references across `src/pages/`, `src/lib/`, and `api-server.js` in a single coherent pass.
  - *Why*: Ensures zero residual Google Cloud/AI Studio references remain anywhere in the app UI or system logs.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Grand Aceh Kuliner POS                         │
├───────────────────────────────────┬─────────────────────────────────────┤
│         Frontend (React 19)       │          FastAPI Backend            │
│  - SettingsInstaller.jsx          │  - /api/backup/send-to-vps          │
│  - AssistantAI.jsx                │  - /api/backup/gdrive               │
│  - WhatsApp.jsx                   │  - /api/diagnostik & /api/health    │
│  - Diagnostik.jsx & Login.jsx     │  - /api/version & /api/installers   │
└─────────────────┬─────────────────┴──────────────────┬──────────────────┘
                  │                                    │
                  ▼                                    ▼
       ┌─────────────────────┐              ┌─────────────────────┐
       │ Google Drive API    │              │ VPS Mandiri Database│
       │ (Cloud Archive)     │              │ (Primary Node Sync) │
       └─────────────────────┘              └─────────────────────┘
```

### Summary of Targeted File Changes:

1. **`api-server.js`**:
   - Rebrand server status messages, benchmark labels, and system health responses ("Google Cloud" -> "Server VPS Utama").
   - Update backup route `/api/backup/send-to-cloud` message to `"Backup database berhasil disinkronkan ke Server VPS Mandiri"`.
2. **`src/pages/SettingsInstaller.jsx`**:
   - Update header title to "Pusat Update Server VPS Mandiri".
   - Rename buttons from "Kirim Backup ke Google AI Studio" to "Sync Database ke Server VPS Mandiri".
   - Update installation guide descriptions to refer to VPS server deployment.
3. **`src/pages/AssistantAI.jsx`**:
   - Rename feature request modal title to "Usulkan Fitur untuk Server POS Mandiri".
   - Update toast messages to reference Server VPS.
4. **`src/pages/WhatsApp.jsx`**:
   - Update Hermes sync card header & description: "Jalur Sinkronisasi Hermes (Server VPS Utama ↔ Raspberry Pi Toko)".
5. **`src/pages/Diagnostik.jsx`**:
   - Rebrand latency and speed test cards to "Server VPS Utama".
6. **`src/pages/Login.jsx` & `src/lib/api.js`**:
   - Update offline server warning messages to reference "Server VPS Mandiri".
7. **`src/lib/installers.js` & `src/lib/diag.js`**:
   - Rebrand installer shell scripts to "Pusat Update Server VPS Mandiri".
