"""GrandPOS FastAPI application.

Transactional REST API over the explicit service layer in app/services.py.
Authentication is a deployment-provided bearer token (POS_API_KEY env); the
task scope (local-only, no credentials) defines its shape but ships no value.
"""

from __future__ import annotations

import hmac
import json
import logging
import os
from typing import Any

log = logging.getLogger(__name__)

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import db as database
from .constants import ORDER_TYPES
from .guard import (
    CONNECTIVITY_HEADER,
    OFFLINE_BLOCK_MESSAGE,
    Allowlist,
    resolve_connectivity,
)
from .services import (
    BusinessRuleError,
    close_shift,
    create_order,
    create_reservation,
    generate_vendor_settlements,
    get_open_shift,
    open_shift,
    pay_order,
    record_cash_movement,
    void_order,
)

from .rules import (
    LANDING_KEY_SCHEMA,
    LANDING_SECTIONS,
    validate_landing_config,
    validate_landing_key,
    validate_landing_section,
    validate_landing_value,
)


def _api_key() -> str | None:
    return os.environ.get("POS_API_KEY")


def require_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    """Fail closed unless the deployment provides the configured API key."""
    expected = _api_key()
    if not expected:
        raise HTTPException(status_code=503, detail="POS_API_KEY belum dikonfigurasi")
    if not x_api_key or not hmac.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="invalid API key")


def error_to_http(exc: BusinessRuleError) -> HTTPException:
    message = str(exc)
    lowered = message.lower()
    if "already" in lowered or "conflict" in lowered or "is already" in lowered:
        return HTTPException(status_code=409, detail=message)
    if "not found" in lowered or "no open shift" in lowered:
        return HTTPException(status_code=404, detail=message)
    return HTTPException(status_code=422, detail=message)


def infrastructure_error_to_http(exc: Exception) -> HTTPException:
    """Map infrastructure errors (DB connection, etc.) to 503 Service Unavailable.

    Does not leak internal details (DSN, host, port) to the client.
    """
    # Log the full error for debugging (server-side only)
    log.warning("Infrastructure error: %s: %s", type(exc).__name__, exc)
    return HTTPException(
        status_code=503,
        detail="layanan sedang tidak tersedia",
    )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LineIn(BaseModel):
    product_id: int
    qty: str | float | int = "1"
    is_weighted: bool = False
    weight_kg: str | None = None
    note: str | None = None


class OrderCreate(BaseModel):
    order_type: str = Field(pattern="^(dine_in|takeaway|retail)$")
    table_id: int | None = None
    member_id: int | None = None
    promo_code: str | None = None
    note: str | None = None
    lines: list[LineIn] = Field(min_length=1)


class PaymentIn(BaseModel):
    method: str = Field(pattern="^(cash|qris|debit|credit|transfer|voucher)$")
    amount: int = Field(gt=0)
    tendered: int | None = None
    reference_no: str | None = None
    idempotency_key: str | None = None


class PayIn(BaseModel):
    payments: list[PaymentIn] = Field(min_length=1)
    captured_by: int
    expected_version: int | None = None


class ShiftOpen(BaseModel):
    opening_float: int = Field(ge=0)
    opened_by: int
    cashier_id: int | None = None


class ShiftClose(BaseModel):
    counted_cash: int = Field(ge=0)
    closed_by: int
    notes: str | None = None
    expected_version: int | None = None


class CashIn(BaseModel):
    direction: str = Field(pattern="^(in|out)$")
    amount: int = Field(gt=0)
    reason: str = Field(min_length=3)
    created_by: int


class VoidIn(BaseModel):
    voided_by: int
    reason: str = Field(min_length=3)
    expected_version: int | None = None


class ReservationIn(BaseModel):
    customer_name: str = Field(min_length=1, max_length=80)
    customer_phone: str = Field(min_length=7, max_length=20)
    reserved_date: str
    reserved_time: str
    party_size: int = Field(gt=0, le=500)
    source: str = "whatsapp"


# ---------------------------------------------------------------------------
# Kiosk (edge) sync schemas
# ---------------------------------------------------------------------------


class EdgeTransactionIn(BaseModel):
    """Satu transaksi dari kiosk Pi.

    Sengaja longgar: payload asli Pi disimpan utuh di ``edge_transactions``
    dan hanya field yang benar-benar dipakai penerjemah yang divalidasi di
    sini. Field tak dikenal dibiarkan lewat (bukan ditolak) supaya versi Pi
    yang lebih baru tidak langsung gagal sinkronisasi.
    """

    model_config = {"extra": "allow"}

    id: str | None = None
    client_ref: str | None = None
    order_number: str | None = None
    items: list[dict] = Field(default_factory=list)


class EdgeSyncIn(BaseModel):
    """Satu batch kiriman kiosk."""

    node_id: str = Field(min_length=1, max_length=64)
    transactions: list[EdgeTransactionIn] = Field(default_factory=list, max_length=200)


def _edge_node_key() -> str:
    """Token rahasia untuk endpoint kiosk (``X-Node-Key``).

    Fail-closed: tanpa ``NODE_SYNC_KEY`` di environment, endpoint kiosk
    menolak semua kiriman. Token ini terpisah dari ``POS_API_KEY`` karena
    pemanggilnya adalah proses server Pi, bukan browser/kasir.
    """
    return os.environ.get("NODE_SYNC_KEY", "").strip()


class WhatsAppInbound(BaseModel):
    sender: str
    text: str
    delivery_id: str | None = None


class LandingConfigIn(BaseModel):
    """PUT body for /api/landing/config.

    Accepts a nested object: {section: {key: value, ...}, ...}.
    Validation is performed in the route handler using rules.validate_landing_config.

    ``extra="forbid"`` is deliberate: with ``extra="allow"`` a caller who omits
    the ``config`` wrapper (e.g. body ``{"hero": {...}}``) would silently get a
    200 no-op, believing the write succeeded. Rejecting unknown top-level keys
    turns that mistake into a 422 the caller can act on.
    """

    model_config = {"extra": "forbid"}

    config: dict = Field(default_factory=dict)


def _lines(payload: list[LineIn]) -> list:
    from .services import LineInput

    return [
        LineInput(
            product_id=line.product_id,
            qty=line.qty,
            is_weighted=line.is_weighted,
            weight_kg=line.weight_kg,
            note=line.note,
        )
        for line in payload
    ]


def create_app() -> FastAPI:
    app = FastAPI(title="GrandPOS", version="1.0.0")

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "db": database.healthcheck()}

    @app.post("/shifts/open", dependencies=[Depends(require_key)])
    def shifts_open(payload: ShiftOpen) -> dict[str, Any]:
        try:
            with database.connect() as conn, conn.transaction():
                with conn.cursor() as cur:
                    return open_shift(cur, opening_float=payload.opening_float, opened_by=payload.opened_by,
                                     cashier_id=payload.cashier_id)
        except BusinessRuleError as exc:
            raise error_to_http(exc)

    @app.get("/shifts/active/summary", dependencies=[Depends(require_key)])
    def shifts_active() -> dict[str, Any]:
        try:
            with database.connect() as conn, conn.cursor() as cur:
                shift = get_open_shift(cur, for_update=False)
                if shift is None:
                    raise HTTPException(status_code=404, detail="no open shift")
                if database.ai_database_url():
                    summary = database.run_report("shift_cash", {"shift_id": shift["id"]})
                    return {"shift": shift, "cash": summary[0] if summary else None,
                            "reply_text": f"Shift {shift['code']} terbuka."}
                return {"shift": shift, "reply_text": f"Shift {shift['code']} terbuka."}
        except BusinessRuleError as exc:
            raise error_to_http(exc)

    @app.post("/shifts/{shift_id}/close", dependencies=[Depends(require_key)])
    def shifts_close(
        shift_id: int,
        payload: ShiftClose,
        x_terminal_connectivity: str | None = Header(default=None, alias=CONNECTIVITY_HEADER),
    ) -> dict[str, Any]:
        # Degraded-mode guard (API layer only): closing a shift writes the
        # final reconciliation, which must not drift while offline.
        if resolve_connectivity(x_terminal_connectivity)["mode"] == "offline":
            raise HTTPException(status_code=409, detail=OFFLINE_BLOCK_MESSAGE)
        try:
            with database.connect() as conn, conn.transaction():
                with conn.cursor() as cur:
                    return close_shift(
                        cur, shift_id=shift_id, closed_by=payload.closed_by,
                        counted_cash=payload.counted_cash, notes=payload.notes,
                        expected_version=payload.expected_version,
                    )
        except BusinessRuleError as exc:
            raise error_to_http(exc)

    @app.post("/cash-movements", dependencies=[Depends(require_key)])
    def cash(
        payload: CashIn,
        x_terminal_connectivity: str | None = Header(default=None, alias=CONNECTIVITY_HEADER),
    ) -> dict[str, Any]:
        # Degraded-mode guard (API layer only): cash-out leaves the drawer,
        # so it is blocked offline; cash-in (change float, corrections) stays.
        if payload.direction == "out" and resolve_connectivity(x_terminal_connectivity)["mode"] == "offline":
            raise HTTPException(status_code=409, detail=OFFLINE_BLOCK_MESSAGE)
        try:
            with database.connect() as conn, conn.transaction():
                with conn.cursor() as cur:
                    return record_cash_movement(
                        cur, shift_id=0, direction=payload.direction, amount=payload.amount,
                        reason=payload.reason, created_by=payload.created_by,
                    )
        except BusinessRuleError as exc:
            raise error_to_http(exc)

    @app.get("/system/connectivity")
    def system_connectivity(
        x_terminal_connectivity: str | None = Header(default=None, alias=CONNECTIVITY_HEADER),
    ) -> dict[str, Any]:
        """Connectivity snapshot so the POS UI can grey out blocked buttons."""
        return resolve_connectivity(x_terminal_connectivity)

    @app.post("/orders", dependencies=[Depends(require_key)])
    def orders_create(payload: OrderCreate, created_by: int = 1) -> dict[str, Any]:
        try:
            with database.connect() as conn, conn.transaction():
                with conn.cursor() as cur:
                    result = create_order(
                        cur, order_type=payload.order_type, created_by=created_by,
                        table_id=payload.table_id, member_id=payload.member_id,
                        lines=_lines(payload.lines), promo_code=payload.promo_code,
                        note=payload.note,
                    )
                    return _jsonable(result)
        except BusinessRuleError as exc:
            raise error_to_http(exc)
        except Exception as exc:  # Infrastructure errors (DB connection, etc.)
            raise infrastructure_error_to_http(exc)

    @app.post("/orders/{order_id}/pay", dependencies=[Depends(require_key)])
    def orders_pay(order_id: int, payload: PayIn, idempotency_key: str | None = Header(default=None)) -> dict[str, Any]:
        try:
            with database.connect() as conn, conn.transaction():
                with conn.cursor() as cur:
                    result = pay_order(
                        cur, order_id=order_id,
                        payments=[p.model_dump() for p in payload.payments],
                        captured_by=payload.captured_by,
                        idempotency_key=idempotency_key,
                        expected_version=payload.expected_version,
                    )
                    return _jsonable(result)
        except BusinessRuleError as exc:
            raise error_to_http(exc)

    @app.post("/orders/{order_id}/void", dependencies=[Depends(require_key)])
    def orders_void(order_id: int, payload: VoidIn) -> dict[str, Any]:
        try:
            with database.connect() as conn, conn.transaction():
                with conn.cursor() as cur:
                    return void_order(cur, order_id=order_id, voided_by=payload.voided_by, reason=payload.reason,
                                      expected_version=payload.expected_version)
        except BusinessRuleError as exc:
            raise error_to_http(exc)

    @app.get("/reports/low-stock", dependencies=[Depends(require_key)])
    def reports_low_stock(limit: int = 50) -> dict[str, Any]:
        rows = database.run_report("low_stock", {"limit": limit})
        lines = ", ".join(f"{r['name']} ({r['stock_qty']}/{r['min_stock_qty']} {r['unit']})" for r in rows)
        return {"items": rows,
                "reply_text": f"Stok menipis: {lines}" if lines else "Semua stok aman."}

    @app.get("/reports/dashboard", dependencies=[Depends(require_key)])
    def reports_dashboard() -> dict[str, Any]:
        start, end = database.today_range()
        rows = database.run_report("daily_turnover", {"start": str(start), "end": str(end)})
        paid = [r for r in rows]
        turnover = sum(int(r["gross_turnover"]) for r in paid)
        orders = sum(int(r["paid_orders"]) for r in paid)
        avg = turnover // orders if orders else 0
        return {
            "date": str(start), "turnover": turnover, "orders": orders, "average": avg,
            "rows": rows,
            "reply_text": f"Omzet {start}: Rp{turnover:,} dari {orders} transaksi, rata-rata Rp{avg:,}.",
        }

    @app.get("/reports/best-sellers", dependencies=[Depends(require_key)])
    def reports_best_sellers(days: int = 7, limit: int = 20) -> dict[str, Any]:
        from datetime import timedelta
        from .db import business_today

        week_start = business_today() - timedelta(days=days)
        return {"items": database.run_report(
            "weekly_best_sellers", {"week_start": str(week_start), "limit": limit})}

    @app.get("/vendors/{vendor_id}/settlements", dependencies=[Depends(require_key)])
    def vendor_settlements(vendor_id: int) -> dict[str, Any]:
        with database.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM vendor_settlements WHERE vendor_id = %s ORDER BY id DESC", (vendor_id,))
            return {"items": cur.fetchall()}

    @app.post("/reservations/intake", dependencies=[Depends(require_key)])
    def reservations_intake(payload: ReservationIn) -> dict[str, Any]:
        from .rules import reservation_slot_ok
        from datetime import datetime

        try:
            day = datetime.strptime(payload.reserved_date, "%Y-%m-%d").date()
            hour, minute = (int(x) for x in payload.reserved_time.split(":"))
            reservation_slot_ok(day, hour, minute, payload.party_size)
        except (ValueError, BusinessRuleError) as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        try:
            with database.connect() as conn, conn.transaction():
                with conn.cursor() as cur:
                    row = create_reservation(
                        cur, customer_name=payload.customer_name, customer_phone=payload.customer_phone,
                        reserved_date=payload.reserved_date, reserved_time=payload.reserved_time,
                        party_size=payload.party_size, source=payload.source,
                    )
                    return {"reservation": row,
                            "reply_text": f"Reservasi {row['code']} diterima."}
        except BusinessRuleError as exc:
            raise error_to_http(exc)

    # ------------------------------------------------------------------
    # Kiosk (edge) sync — Raspberry Pi -> gudang
    # ------------------------------------------------------------------

    @app.post("/sync/orders")
    def sync_orders(payload: EdgeSyncIn,
                    x_node_key: str | None = Header(default=None, alias="X-Node-Key")) -> dict[str, Any]:
        """Terima batch transaksi dari kiosk Pi.

        Kontrak:
        * Autentikasi memakai ``X-Node-Key`` (``NODE_SYNC_KEY``), terpisah
          dari ``POS_API_KEY`` milik kasir. Fail-closed: tanpa token itu
          dikonfigurasi, endpoint menolak semua kiriman (503).
        * Idempoten per ``(node_id, client_ref)``. Kiriman ulang setelah
          timeout jaringan mengembalikan nomor order yang sama, tanpa
          membuat transaksi kedua.
        * Nomor order yang dikirim Pi dipertahankan (tanpa renumbering).
        * Gagal per-baris: payload rusak ditandai ``rejected`` dan sisanya
          tetap diproses.
        """
        expected = _edge_node_key()
        if not expected:
            raise HTTPException(status_code=503, detail="kiosk sync not configured")
        if not x_node_key or not hmac.compare_digest(str(x_node_key), expected):
            raise HTTPException(status_code=401, detail="invalid node key")

        from . import edge_sync

        accepted: list[dict] = []
        duplicates: list[dict] = []
        rejected: list[dict] = []

        for txn in payload.transactions:
            raw = txn.model_dump()
            client_ref = (raw.get("client_ref") or raw.get("id") or "").strip()
            if not client_ref:
                rejected.append({"client_ref": None, "error": "tanpa client_ref"})
                continue
            try:
                outcome = _ingest_one(payload.node_id, client_ref, raw, edge_sync)
            except Exception as exc:  # noqa: BLE001 - never break the batch
                log.warning("edge ingest gagal node=%s ref=%s: %s",
                            payload.node_id, client_ref, type(exc).__name__)
                rejected.append({"client_ref": client_ref, "error": str(exc)[:300]})
                continue
            if outcome.get("duplicate"):
                duplicates.append(outcome)
            elif outcome.get("status") == "rejected":
                # Per-row rejection (invalid payload, constraint violation) must not be
                # reported as accepted: a kiosk that drains its queue on "accepted"
                # would silently drop the sale.
                rejected.append({"client_ref": client_ref,
                                 "error": (outcome.get("error") or "rejected")[:300]})
            else:
                accepted.append(outcome)

        return {
            "ok": True,
            "node_id": payload.node_id,
            "received": len(payload.transactions),
            "accepted": len(accepted),
            "duplicate": len(duplicates),
            "rejected": len(rejected),
            "results": accepted + duplicates,
            "errors": rejected,
        }

    @app.get("/sync/master")
    def sync_master(
        x_node_key: str | None = Header(default=None, alias="X-Node-Key"),
    ) -> dict[str, Any]:
        """Master data gudang untuk kiosk Pi.

        Dibaca oleh cron Pi tiap beberapa menit supaya harga/stok di kiosk
        mengikuti gudang. Hanya field yang aman dan stabil yang dikirim:
        sku, nama, kategori, channel, harga, dan status aktif.
        """
        expected = _edge_node_key()
        if not expected:
            raise HTTPException(status_code=503, detail="kiosk sync not configured")
        if not x_node_key or not hmac.compare_digest(str(x_node_key), expected):
            raise HTTPException(status_code=401, detail="invalid node key")
        with database.connect() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT p.id, p.sku, p.name, p.channel, p.base_price, p.cost_price, "
                "       p.sold_by_weight, p.unit, p.is_active, c.name AS category_name, "
                "       c.slug AS category_slug "
                "  FROM products p LEFT JOIN categories c ON c.id = p.category_id "
                " ORDER BY p.id"
            )
            products = [_jsonable(dict(r)) for r in cur.fetchall()]
            cur.execute(
                "SELECT id, name, slug, channel, sort_order, is_active FROM categories ORDER BY id"
            )
            categories = [_jsonable(dict(r)) for r in cur.fetchall()]
            cur.execute("SELECT id, code, label, seats, zone, status FROM tables ORDER BY id")
            tables = [_jsonable(dict(r)) for r in cur.fetchall()]
        from datetime import datetime, timezone
        return {
            "ok": True,
            "server_time": datetime.now(timezone.utc).isoformat(),
            "products": products,
            "categories": categories,
            "tables": tables,
        }

    @app.get("/sync/orders/status")
    def sync_orders_status(
        limit: int = 20,
        x_node_key: str | None = Header(default=None, alias="X-Node-Key"),
    ) -> dict[str, Any]:
        """Ringkasan antrean kiosk — untuk diagnosa 'sudah kirim tapi belum masuk'."""
        expected = _edge_node_key()
        if not expected:
            raise HTTPException(status_code=503, detail="kiosk sync not configured")
        if not x_node_key or not hmac.compare_digest(str(x_node_key), expected):
            raise HTTPException(status_code=401, detail="invalid node key")
        with database.connect() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT status, count(*) AS n FROM edge_transactions GROUP BY status ORDER BY status"
            )
            totals = {row["status"]: int(row["n"]) for row in cur.fetchall()}
            cur.execute(
                "SELECT node_id, client_ref, status, order_number, attempts, "
                "       left(coalesce(last_error, ''), 160) AS last_error, created_at "
                "  FROM edge_transactions ORDER BY created_at DESC LIMIT %s",
                (max(1, min(limit, 200)),),
            )
            recent = [_jsonable(dict(row)) for row in cur.fetchall()]
        return {"ok": True, "totals": totals, "recent": recent}

    @app.post("/wa/inbound", dependencies=[Depends(require_key)])
    def wa_inbound(payload: WhatsAppInbound) -> dict[str, Any]:
        """Zero-token WhatsApp command endpoint for the Baileys service."""
        from .db import business_today

        from .parsers import parse_command

        raw_allowlist = os.environ.get("WA_ALLOWED_NUMBERS", "")
        allow = Allowlist.from_env(raw_allowlist, owner=os.environ.get("WA_OWNER_NUMBER"))
        try:
            sender = allow.require(payload.sender)
        except Exception:
            raise HTTPException(status_code=403, detail="sender not allowlisted")
        parsed = parse_command(payload.text, today=business_today())
        if parsed.is_command is False:
            return {"forward": True, "sender": sender}
        if parsed.name:  # type: ignore[union-attr]  # noqa: SLF001 - narrow Command
            endpoint = parsed.endpoint  # type: ignore[union-attr]
            if endpoint == "/reports/low-stock":
                rows = database.run_report("low_stock", {"limit": 20})
                lines = ", ".join(f"{r['name']} ({r['stock_qty']}/{r['min_stock_qty']})" for r in rows)
                return {"reply_text": f"Stok menipis: {lines}" if lines else "Semua stok aman."}
            if endpoint == "/reports/dashboard":
                start, end = database.today_range()
                rows = database.run_report("daily_turnover", {"start": str(start), "end": str(end)})
                turnover = sum(int(r["gross_turnover"]) for r in rows)
                orders = sum(int(r["paid_orders"]) for r in rows)
                avg = turnover // orders if orders else 0
                return {"reply_text": f"Omzet {start}: Rp{turnover:,} dari {orders} transaksi."}
            if endpoint == "/shifts/active/summary":
                with database.connect() as conn, conn.cursor() as cur:
                    shift = get_open_shift(cur, for_update=False)
                    if shift is None:
                        return {"reply_text": "Tidak ada shift aktif."}
                    return {"reply_text": f"Shift {shift['code']} terbuka, {shift['order_count']} transaksi."}
        # Reservation path.
        try:
            with database.connect() as conn, conn.transaction():
                with conn.cursor() as cur:
                    row = create_reservation(
                        cur, customer_name=parsed.customer_name,  # type: ignore[union-attr]
                        customer_phone=sender,
                        reserved_date=str(parsed.reserved_date),  # type: ignore[union-attr]
                        reserved_time=f"{parsed.hour:02d}:{parsed.minute:02d}",  # type: ignore[union-attr]
                        party_size=parsed.party_size,  # type: ignore[union-attr]
                        source="whatsapp",
                    )
                    return {"reply_text": f"Reservasi {row['code']} diterima."}
        except BusinessRuleError as exc:
            raise error_to_http(exc)

    # ------------------------------------------------------------------
    # Landing Page Configuration
    # ------------------------------------------------------------------

    @app.get("/api/landing/config", dependencies=[Depends(require_key)])
    def landing_config_get() -> dict[str, Any]:
        """Return all landing config grouped by section."""
        with database.connect() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT section, key, value FROM landing_config ORDER BY section, key"
            )
            rows = cur.fetchall()

        config: dict[str, dict[str, Any]] = {}
        for row in rows:
            section = row["section"]
            key = row["key"]
            value = row["value"]
            if section not in config:
                config[section] = {}
            config[section][key] = value

        return config

    @app.put("/api/landing/config", dependencies=[Depends(require_key)])
    def landing_config_put(payload: LandingConfigIn) -> dict[str, Any]:
        """Upsert landing config. Validates input, writes rows, returns updated config."""
        # Validate the incoming config structure
        try:
            validate_landing_config(payload.config)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        with database.connect() as conn, conn.transaction():
            with conn.cursor() as cur:
                # Upsert each section/key/value
                for section, keys in payload.config.items():
                    for key, value in keys.items():
                        # Double-check validation (defense in depth)
                        validate_landing_section(section)
                        validate_landing_key(section, key)
                        validate_landing_value(section, key, value)

                        cur.execute(
                            """
                            INSERT INTO landing_config (section, key, value)
                            VALUES (%s, %s, %s)
                            ON CONFLICT (section, key) DO UPDATE
                            SET value = EXCLUDED.value, updated_at = now()
                            """,
                            (section, key, json.dumps(value)),
                        )

        # Return the updated config (fresh read)
        with database.connect() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT section, key, value FROM landing_config ORDER BY section, key"
            )
            rows = cur.fetchall()

        config: dict[str, dict[str, Any]] = {}
        for row in rows:
            section = row["section"]
            key = row["key"]
            value = row["value"]
            if section not in config:
                config[section] = {}
            config[section][key] = value

        return config

    return app


def _record_edge_failure(node_id: str, client_ref: str, payload: dict, exc: BaseException) -> None:
    """Catat kegagalan ingest walau transaksi bisnisnya di-rollback.

    Pelanggaran constraint membatalkan transaksi yang menyimpan baris antrean,
    sehingga bukti kegagalan ikut hilang tepat saat paling dibutuhkan
    (diagnosa "sudah kirim tapi belum masuk"). Baris ditulis ulang di koneksi
    terpisah.
    """
    from . import db as database

    detail = f"{type(exc).__name__}: {exc}"[:500]
    try:
        with database.connect() as conn, conn.transaction(), conn.cursor() as cur:
            cur.execute(
                "INSERT INTO edge_transactions (node_id, client_ref, payload, status, attempts, last_error) "
                "VALUES (%s, %s, %s, 'rejected', 1, %s) "
                "ON CONFLICT (node_id, client_ref) DO UPDATE "
                "SET status = 'rejected', attempts = edge_transactions.attempts + 1, "
                "    last_error = EXCLUDED.last_error",
                (node_id, client_ref, json.dumps(payload, default=str, sort_keys=True), detail),
            )
            cur.execute(
                "INSERT INTO edge_ingest_log (node_id, client_ref, outcome, detail) "
                "VALUES (%s, %s, 'rejected', %s)",
                (node_id, client_ref, detail[:300]),
            )
    except Exception:  # noqa: BLE001 - jangan menutupi kegagalan aslinya
        log.warning("gagal mencatat kegagalan ingest node=%s ref=%s", node_id, client_ref)


def _ingest_one(node_id: str, client_ref: str, payload: dict, edge_sync: Any) -> dict:
    """Simpan + proses satu transaksi kiosk dalam transaksi sendiri.

    Transaksi per-baris (bukan per-batch) sengaja: bila satu payload
    melanggar constraint, hanya baris itu yang dibatalkan — baris
    sebelumnya tetap tersimpan dan batch tidak gagal total.
    """
    from . import db as database

    try:
        with database.connect() as conn, conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO edge_transactions (node_id, client_ref, payload, status) "
                    "VALUES (%s, %s, %s, 'pending') "
                    "ON CONFLICT (node_id, client_ref) DO UPDATE "
                    "  SET payload = EXCLUDED.payload "
                    "  WHERE edge_transactions.status = 'rejected' "
                    "RETURNING id",
                    (node_id, client_ref, json.dumps(payload, default=str, sort_keys=True)),
                )
                row = cur.fetchone()
                if row is None:
                    # Sudah pernah diterima: kembalikan hasil lama, jangan proses ulang.
                    cur.execute(
                        "SELECT id, status, order_number, last_error FROM edge_transactions "
                        " WHERE node_id = %s AND client_ref = %s",
                        (node_id, client_ref),
                    )
                    prev = cur.fetchone() or {}
                    return {
                        "client_ref": client_ref,
                        "duplicate": True,
                        "status": prev.get("status") or "pending",
                        "order_number": prev.get("order_number"),
                        "error": prev.get("last_error"),
                    }

                edge_id = int(row["id"])
                try:
                    result = edge_sync.apply_transaction(cur, node_id=node_id, payload=payload)
                except edge_sync.EdgeSyncError as exc:
                    cur.execute(
                        "UPDATE edge_transactions SET status = 'rejected', attempts = attempts + 1, "
                        " last_error = %s WHERE id = %s",
                        (str(exc)[:500], edge_id),
                    )
                    cur.execute(
                        "INSERT INTO edge_ingest_log (node_id, client_ref, outcome, detail) "
                        "VALUES (%s, %s, 'rejected', %s)",
                        (node_id, client_ref, str(exc)[:300]),
                    )
                    return {"client_ref": client_ref, "duplicate": False, "status": "rejected",
                            "error": str(exc)[:300]}

                cur.execute(
                    "UPDATE edge_transactions SET status = 'applied', attempts = attempts + 1, "
                    " order_number = %s, last_error = NULL WHERE id = %s",
                    (result["order_number"], edge_id),
                )
                cur.execute(
                    "INSERT INTO edge_ingest_log (node_id, client_ref, outcome, order_number, detail) "
                    "VALUES (%s, %s, 'accepted', %s, %s)",
                    (
                        node_id,
                        client_ref,
                        result["order_number"],
                        json.dumps({"price_drifts": result["price_drifts"]}, sort_keys=True)
                        if result.get("price_drifts")
                        else None,
                    ),
                )
                return {"client_ref": client_ref, "duplicate": False, "status": "applied", **result}
    except Exception as exc:  # noqa: BLE001 - catat lalu teruskan
        # Termasuk pelanggaran constraint PostgreSQL: rollback menghapus baris
        # antrean, jadi kegagalan dicatat di koneksi baru sebelum diteruskan.
        log.warning("edge ingest gagal node=%s ref=%s: %s", node_id, client_ref, type(exc).__name__)
        _record_edge_failure(node_id, client_ref, payload, exc)
        raise


def _jsonable(value: Any) -> Any:
    """Convert Decimals/dates from the service layer into JSON-safe values."""
    from datetime import date, datetime
    from decimal import Decimal

    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


app = create_app()
