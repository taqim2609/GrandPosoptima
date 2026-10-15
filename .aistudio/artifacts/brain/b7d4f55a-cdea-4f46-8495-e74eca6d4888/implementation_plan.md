# Multi-Provider WhatsApp Gateway with WhatsApp Web-Style Live Chat Plan

Architectural design and implementation strategy for transitioning the Grand Aceh Kuliner POS WhatsApp notification system to a cloud-and-edge multi-provider setup with a **WhatsApp Web-style Live Chat Inbox** embedded directly in the POS frontend (`/whatsapp`). The system utilizes Hermes (Baileys-based) as the primary gateway and `https://app.wacloud.id/api/v1` as an automatic failover provider, synchronized via Cloud Firestore.

## User Review & Critical Decisions

> [!IMPORTANT]
> Confirmed architecture and new chat capabilities:

- **Confirmed Decision 1: WhatsApp Web-Style Chat Inbox in POS**: A full 2-way live conversation interface inside POS (`/whatsapp`) featuring contact lists, chat history bubbles, template quick-replies, and direct POS actions (send receipt, shift report, stock alert).
- **Confirmed Decision 2: Primary Engine (Hermes / Baileys)**: Hermes runs on Baileys, which natively syncs full 2-way chat sessions, incoming/outgoing text & media, and contact status.
- **Confirmed Decision 3: Failover Provider (`wacloud.id`)**: Fallback to `https://app.wacloud.id/api/v1` when Hermes is unreachable or offline, ensuring outbox messages and customer replies are delivered reliably.
- **Confirmed Decision 4: Real-time Cloud Sync**: Firestore `wa_chats` and `wa_outbox` collections synchronize live messages between Google Cloud and Raspberry Pi POS nodes.

---

## 1. Unofficial WhatsApp API Comparison & Capabilities

| Gateway / Engine | WhatsApp Web UI Chat Capability | 2-Way Live Webhooks | Media Support | Role in Grand POS |
| :--- | :--- | :--- | :--- | :--- |
| **Hermes (Baileys)** | **Yes (Full)** — Syncs chat lists, message history, text, media, and status | **Yes** — via HMAC webhook & `grandpos-wa-inbound` plugin | **Yes** — Images, PDFs, Voice | **Primary Gateway** (Runs on store server/Pi) |
| **wacloud.id API** | **Yes** — REST API endpoints for sending, receiving & web portal | **Yes** — Inbound webhook + REST outbox | **Yes** — Text & attachments | **Failover Gateway** (`https://app.wacloud.id/api/v1`) |
| **Evolution API / WwebJS** | **Yes** — Multi-instance REST API wrapper over Baileys / WwebJS | **Yes** — Webhooks & WebSockets | **Yes** — Full media support | Alternative self-hosted fallback |

---

## 2. User Experience & Visual Design (POS Live Chat UI)

- **Layout Structure (`/whatsapp` Page)**:
  - **Left Sidebar (Chat List, 320px)**:
    - Search bar (filter by contact name, phone, or order ID).
    - Status tabs (All, Unread, Customers, Vendors, Staff).
    - Chat list items displaying contact avatar, name/phone, last message snippet, timestamp, unread count badge.
  - **Main Viewport (Active Chat Room)**:
    - **Header**: Contact name, phone number, connection node badge (Hermes Primary / wacloud.id Failover), status indicator.
    - **Message Stream**: Scrollable bubble thread with distinct styles for inbound (left, dark slate bubble) and outbound (right, emerald bubble with delivery ticks `✓✓`).
    - **Action Toolbar above input**:
      - `[Send Receipt]` shortcut button (pick recent transaction to generate & format text receipt).
      - `[Send Shift Report]` quick report shortcut.
      - `[Quick Templates]` dropdown (greeting, order confirmation, bank transfer info).
    - **Message Input Bar**: Text input area, attachment icon, send button, and provider indicator.

- **Visual Identity & Theme**:
  - High-density SaaS chat interface styled with Tailwind CSS, matching Grand POS aesthetic.
  - Emerald `#059669` accents for WhatsApp branding, Slate `#0F172A` neutral canvas, Amber `#D97706` for failover active state.
  - Tabular numerals (`font-mono tabular-nums`) for message timestamps (`10:45 AM`) and transaction IDs.

---

## 3. Key Technical Decisions & Data Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Grand POS Live Chat UI (/whatsapp)                       │
│           (React 19 Frontend with Firestore Realtime Listeners)             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Cloud Firestore (`wa_chats` & `wa_outbox`)                  │
│       Real-time 2-Way Message Store & Synchronization across Nodes          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                         Unified WhatsApp Manager
                                       │
                 ┌─────────────────────┴─────────────────────┐
                 │                                           │
                 ▼                                           ▼
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│     Primary Gateway (Hermes)    │         │   Failover Gateway (wacloud.id) │
│  http://127.0.0.1:8644/webhooks │         │   https://app.wacloud.id/api/v1 │
│  Inbound: pre_gateway_dispatch  │         │   Inbound: wacloud webhook      │
└─────────────────────────────────┘         └─────────────────────────────────┘
```

- **Firestore Collections**:
  1. `wa_chats/{chatId}`:
     - `chat_id`: `string` (e.g. `628123456789@s.whatsapp.net`)
     - `name`: `string`
     - `phone`: `string`
     - `last_message`: `string`
     - `last_message_time`: `timestamp`
     - `unread_count`: `number`
     - `updated_at`: `timestamp`
  2. `wa_chats/{chatId}/messages/{messageId}`:
     - `message_id`: `string`
     - `sender`: `'customer' | 'bot' | 'cashier'`
     - `direction`: `'inbound' | 'outbound'`
     - `text`: `string`
     - `status`: `'pending' | 'sent' | 'delivered' | 'read' | 'failed'`
     - `provider`: `'hermes' | 'wacloud'`
     - `timestamp`: `timestamp`

---

## 4. Implementation Steps

1. **Backend Integration (`project/backend/hermes_bridge.py` & server routes)**:
   - Enhance `WhatsAppGatewayManager` to support both `HermesAdapter` (Primary) and `WacloudAdapter` (`https://app.wacloud.id/api/v1`).
   - Add API endpoints for chat history (`GET /api/whatsapp/chats`, `GET /api/whatsapp/chats/{phone}/messages`) and live send (`POST /api/whatsapp/send`).
   - Process inbound webhooks from both Hermes plugin and wacloud.id to auto-persist messages to Firestore & MongoDB.

2. **Frontend Live Chat UI (`project/frontend/src/pages/WhatsApp.jsx`)**:
   - Build complete WhatsApp Web-style split view layout with responsive mobile toggle.
   - Attach Firestore `onSnapshot` listeners to `wa_chats` and `wa_chats/{chatId}/messages` for real-time live chat without polling.
   - Add POS shortcut actions (Send Receipt, Shift Summary, Quick Templates) inside the active chat window.

3. **Settings & Health Diagnostic Panel (`project/frontend/src/pages/SettingsIntegrations.jsx`)**:
   - Configure Primary Hermes URL/Secret and Failover `https://app.wacloud.id/api/v1` API Key.
   - Real-time probe status indicators for both gateways.
