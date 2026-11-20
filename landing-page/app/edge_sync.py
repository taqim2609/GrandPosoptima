"""Terjemahan transaksi kiosk (Pi) -> model relasional GrandPOS di gudang-644.

Latar belakang
--------------
Kiosk Pi menjalankan MongoDB-nya sendiri supaya kasir tetap bisa jualan saat
tailnet ke gudang putus. Transaksi yang lahir di Pi karena itu berbentuk
dokumen Mongo: id berupa UUID string, ``order_type`` memakai ``take_away``
(sedang PostgreSQL memakai ``takeaway``), harga float, dan tidak ada konsep
shift/channel.

Modul ini menerjemahkan dokumen itu menjadi orders/order_items/payments yang
sah menurut ``db/schema.sql``, dengan aturan:

* **Nomor order Pi dipertahankan.** Kalau Pi mengirim ``order_number``
  (mis. ``GAK-20261019-0001``), gudang memakai nomor itu apa adanya —
  tanpa renumbering. Ini syarat mutlak supaya struk Pi dan laporan gudang
  bisa disandingkan. Bila nomor itu sudah dipakai transaksi lain, baris
  ditolak (bukan dibuat nomor baru) karena itu tanda kiriman ganda dari
  node berbeda.
* **Idempoten.** ``(node_id, client_ref)`` unik di ``edge_transactions``.
  Kiriman ulang setelah timeout jaringan mengembalikan hasil yang sama
  tanpa membuat transaksi kedua.
* **Gagal per-baris.** Satu payload rusak tidak menggagalkan batch; baris
  itu ditandai ``rejected`` beserta alasannya, sisanya tetap diproses.

Modul ini sengaja tidak memakai HTTP client dan tidak membuka transaksi
sendiri: pemanggil (endpoint ``/sync/orders``) yang memiliki keduanya,
sehingga fungsi-fungsi di sini tetap bisa diuji tanpa database.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from .constants import ORDER_STATUSES

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pemetaan vocabulary Pi -> gudang
# ---------------------------------------------------------------------------

#: ``order_type`` MongoDB Pi -> enum ``order_type`` PostgreSQL.
ORDER_TYPE_MAP = {
    "dine_in": "dine_in",
    "take_away": "takeaway",
    "takeaway": "takeaway",
    "retail": "retail",
}

#: Tipe produk Pi -> channel gudang.
#: Catatan: tipe "vendor" di Pi bukan channel tersendiri — produk titipan
#: tetap berada di channel asalnya (fnb/retail) dan bagi hasilnya dicatat
#: lewat vendors/products.vendor_id.
TYPE_CHANNEL_MAP = {
    "makanan": "fnb",
    "minuman": "fnb",
    "retail": "retail",
    "vendor": "fnb",
}

#: Metode pembayaran Pi -> CHECK constraint payments.method.
PAYMENT_METHOD_MAP = {
    "cash": "cash",
    "tunai": "cash",
    "qris": "qris",
    "debit": "debit",
    "kartu debit": "debit",
    "kartu debit/kredit": "debit",
    "credit": "credit",
    "kredit": "credit",
    "transfer": "transfer",
    "voucher": "voucher",
}


class EdgeSyncError(Exception):
    """Payload dari kiosk tidak bisa diterjemahkan menjadi transaksi sah."""


def _validate_order_status(status: str) -> None:
    """Validate that the given status is a known order status."""
    if status not in ORDER_STATUSES:
        raise EdgeSyncError(f"invalid order status: {status!r}")


# ---------------------------------------------------------------------------
# Pembantu: konversi nilai
# ---------------------------------------------------------------------------


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _money(value: Any) -> int:
    """Uang Pi berbentuk float Rupiah -> integer IDR (dibulatkan ke terdekat).

    Rupiah tidak memiliki pecahan, jadi pembulatan ke int aman dan wajib:
    kolom uang di PostgreSQL adalah BIGINT.
    """
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError) as exc:
        raise EdgeSyncError(f"nilai uang tidak valid: {value!r}") from exc


def _round_idr(value: Decimal) -> int:
    """Round Rupiah consistently with the business rules (half up)."""
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _qty(value: Any) -> Decimal:
    try:
        qty = Decimal(str(value))
    except Exception as exc:  # noqa: BLE001 - Decimal raises several types
        raise EdgeSyncError(f"qty tidak valid: {value!r}") from exc
    if qty <= 0:
        raise EdgeSyncError(f"qty harus lebih dari 0, dapat {value!r}")
    return qty


def _parse_time(value: Any) -> datetime | None:
    """ISO-8601 (boleh berakhiran Z) -> datetime aware UTC."""
    raw = _text(value)
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


# ---------------------------------------------------------------------------
# Normalisasi payload
# ---------------------------------------------------------------------------


def _normalise_payment(raw: dict, grand_total: int) -> dict:
    raw_method = _text(raw.get("payment_method_type") or raw.get("payment_method")).lower()
    if raw_method:
        method = PAYMENT_METHOD_MAP.get(raw_method)
        if method is None:
            # Coercing an unknown method to "cash" would book a card/transfer sale
            # as drawer cash and break shift reconciliation. Reject it instead so
            # the kiosk surfaces the mismatch with its client_ref.
            raise EdgeSyncError(f"metode pembayaran tidak dikenal: {raw_method!r}")
    else:
        # Legacy Pi payloads without any method field are cash sales.
        method = "cash"
    amount = _money(raw.get("amount") or raw.get("total") or grand_total)
    if amount <= 0:
        raise EdgeSyncError("nominal payment harus lebih dari 0")
    amount_paid = raw.get("amount_paid")
    tendered = _money(amount_paid) if amount_paid is not None else amount
    return {
        "method": method,
        "amount": amount,
        "tendered": tendered if method == "cash" else None,
        "reference_no": _text(raw.get("payment_ref") or raw.get("reference_no")) or None,
        "method_name": _text(raw.get("payment_method_name")) or None,
    }


def _normalise_payments(payload: dict, grand_total: int) -> list[dict]:
    raw_payments = payload.get("payments")
    if raw_payments is not None:
        if not isinstance(raw_payments, list) or not raw_payments:
            raise EdgeSyncError("payments harus berupa daftar tidak kosong")
        payments = [_normalise_payment(item, grand_total) for item in raw_payments]
        if sum(item["amount"] for item in payments) != grand_total:
            raise EdgeSyncError("jumlah payments harus sama dengan total transaksi")
        return payments
    return [_normalise_payment(payload, grand_total)]


def normalize_payload(payload: dict) -> dict:
    """Ubah dokumen transaksi Pi menjadi struktur siap tulis.

    Tidak menyentuh database; hanya memetakan nama field, vocabulary, dan
    tipe angka. Melempar :class:`EdgeSyncError` bila payload tidak bisa
    dipakai sama sekali (tanpa item, tanpa total, dll).
    """
    if not isinstance(payload, dict):
        raise EdgeSyncError("payload harus berupa objek JSON")

    items = payload.get("items") or []
    if not items:
        raise EdgeSyncError("transaksi tidak memiliki item")

    raw_type = _text(payload.get("order_type")).lower()
    order_type = ORDER_TYPE_MAP.get(raw_type)
    if order_type is None:
        raise EdgeSyncError(f"order_type tidak dikenal: {raw_type!r}")

    lines: list[dict] = []
    for index, raw in enumerate(items, start=1):
        if not isinstance(raw, dict):
            raise EdgeSyncError(f"item #{index} bukan objek")
        sku = _text(raw.get("sku") or raw.get("product_code"))
        name = _text(raw.get("name") or raw.get("product_name"))
        if not sku and not name:
            raise EdgeSyncError(f"item #{index} tidak memiliki sku maupun nama")
        raw_item_type = _text(raw.get("type")).lower()
        channel = TYPE_CHANNEL_MAP.get(raw_item_type)
        qty = _qty(raw.get("qty", 1))
        unit_price = _money(raw.get("price") or raw.get("unit_price"))
        weight = raw.get("weight")
        lines.append(
            {
                "sku": sku,
                "name": name,
                "channel": channel,
                "raw_type": raw_item_type,
                "qty": qty,
                "unit_price": unit_price,
                "weight_grams": _money(float(weight) * 1000) if weight else None,
                "note": _text(raw.get("note")) or None,
            }
        )

    # Penjualan tunai: Pi mengirim amount_paid (uang diterima) dan change.
    # payments.amount harus PAS grand_total; uang kembali dicatat di
    # tendered, bukan di amount.
    grand_total = _money(payload.get("total") or payload.get("grand_total"))
    if grand_total <= 0:
        raise EdgeSyncError("total transaksi harus lebih dari 0")

    # Metode top-level dipakai untuk field `payment` ringkas. Aturannya sama
    # dengan _normalise_payment(): metode tak dikenal tidak boleh jadi "cash".
    raw_method = _text(payload.get("payment_method_type") or payload.get("payment_method")).lower()
    if raw_method:
        method = PAYMENT_METHOD_MAP.get(raw_method)
        if method is None:
            raise EdgeSyncError(f"metode pembayaran tidak dikenal: {raw_method!r}")
    else:
        method = "cash"

    amount_paid = payload.get("amount_paid")
    tendered = _money(amount_paid) if amount_paid is not None else grand_total

    return {
        "order_number": _text(payload.get("order_number")) or None,
        "client_ref": _text(payload.get("client_ref") or payload.get("id")) or None,
        "order_type": order_type,
        "table_code": _text(payload.get("table_name") or payload.get("table_code")) or None,
        "lines": lines,
        "subtotal": _money(payload.get("subtotal") or grand_total),
        "discount_total": _money(payload.get("discount") or 0)
        + _money(payload.get("promo_discount") or 0)
        + _money(payload.get("coupon_discount") or 0),
        "service_total": _money(payload.get("service_tax") or 0),
        "grand_total": grand_total,
        "payments": _normalise_payments(payload, grand_total),
        "payment": _normalise_payment(payload, grand_total),
        "cashier_username": _text(payload.get("cashier_username"))
        or _text(payload.get("cashier_name"))
        or None,
        "customer_name": _text(payload.get("customer_name")) or None,
        "note": _text(payload.get("note")) or None,
        "paid_at": _parse_time(payload.get("paid_at") or payload.get("created_at")),
    }


# ---------------------------------------------------------------------------
# Penulisan ke database
# ---------------------------------------------------------------------------


def _resolve_user(cur: Any, username: str | None) -> int:
    """Kasir Pi -> users.id gudang.

    Nama kasir Pi tidak memiliki padanan 1:1 di gudang, jadi pencarian
    dilakukan longgar: cocokkan username persis, lalu display_name (case
    insensitive). Bila tidak ketemu, pakai kasir pertama yang aktif —
    transaksi tetap tercatat dan bisa dilacak lewat ``edge_ingest_log``,
    daripada menggagalkan sinkronisasi hanya karena nama belum sinkron.
    """
    if username:
        row = _q(cur, "SELECT id FROM users WHERE username = %s AND is_active", (username,))
        if row:
            return int(row["id"])
        row = _q(cur, "SELECT id FROM users WHERE lower(display_name) = lower(%s) AND is_active",
                 (username,))
        if row:
            return int(row["id"])
    row = _q(cur, "SELECT id FROM users WHERE is_active ORDER BY id LIMIT 1")
    if not row:
        raise EdgeSyncError("tidak ada pengguna aktif di gudang untuk mencatat transaksi")
    return int(row["id"])


def _reconcile_payment_amounts(payments: list[dict], grand_total: int) -> list[dict]:
    """Make payment rows settle the warehouse-authoritative order total."""
    if not payments or grand_total <= 0:
        raise EdgeSyncError("total payment hasil penyesuaian tidak valid")
    current_total = sum(item["amount"] for item in payments)
    if current_total == grand_total:
        return payments
    adjusted = [dict(item) for item in payments]
    delta = grand_total - current_total
    if delta > 0:
        # Tambah ke baris tunai lebih dulu: kekurangan kas bisa dijelaskan saat
        # tutup shift, sedangkan menaikkan nominal QRIS/kartu tidak akan pernah
        # cocok dengan mutasi bank.
        target = next((item for item in adjusted if item["method"] == "cash"), adjusted[-1])
        target["amount"] += delta
        # Kontrak: `amount` adalah alokasi buku, `tendered` adalah fakta fisik.
        # Kenaikan harga tidak menambah uang yang benar-benar diterima kasir, jadi
        # selisihnya dicatat sebagai tendered_drift (shortage saat tutup shift),
        # bukan dengan menaikkan `tendered`.
        if target["method"] == "cash" and target.get("tendered") is not None:
            shortfall = target["amount"] - target["tendered"]
            if shortfall > 0:
                target["tendered_drift"] = target.get("tendered_drift", 0) + shortfall
    else:
        remaining = -delta
        for item in reversed(adjusted):
            removable = min(remaining, item["amount"] - 1)
            item["amount"] -= removable
            remaining -= removable
            if remaining == 0:
                break
        if remaining:
            raise EdgeSyncError("total payment tidak dapat disesuaikan ke harga gudang")
    return adjusted


def _apply_warehouse_prices(normalized: dict, lines: list[dict]) -> list[dict]:
    """Use warehouse catalog prices and return concise drift audit records."""
    price_drifts = []
    for line in lines:
        product = line["product"]
        if product is None:
            continue
        warehouse_price = int(product["base_price"])
        kiosk_price = line["unit_price"]
        if kiosk_price != warehouse_price:
            price_drifts.append(
                {
                    "sku": line["sku"] or None,
                    "name": product["name"],
                    "kiosk_price": kiosk_price,
                    "warehouse_price": warehouse_price,
                }
            )
        line["unit_price"] = warehouse_price

    subtotal = sum(_round_idr(Decimal(line["unit_price"]) * line["qty"]) for line in lines)
    grand_total = max(subtotal - normalized["discount_total"] + normalized["service_total"], 0)
    normalized["subtotal"] = subtotal
    normalized["grand_total"] = grand_total
    normalized["payments"] = _reconcile_payment_amounts(normalized["payments"], grand_total)
    normalized["payment"] = normalized["payments"][0]
    return price_drifts


def _q(cur: Any, sql: str, params: tuple = ()) -> dict | None:
    cur.execute(sql, params)
    return cur.fetchone()


def _resolve_products(cur: Any, lines: list[dict]) -> list[dict]:
    """SKU Pi -> products.id gudang.

    Produk dicari lewat ``products.sku``. Kalau SKU tidak ada di gudang
    (produk dibuat lokal di Pi), baris dibuat memakai nama Pi dan tanpa
    tautan produk, sehingga transaksi tetap masuk laporan — stok gudang
    tidak bergerak karena memang tidak ada produk yang bisa digerakkan.
    """
    resolved: list[dict] = []
    for line in lines:
        product = None
        if line["sku"]:
            product = _q(
                cur,
                "SELECT id, name, channel, base_price, cost_price, vendor_id "
                "  FROM products WHERE sku = %s",
                (line["sku"],),
            )
        if product is None and line["name"]:
            product = _q(
                cur,
                "SELECT id, name, channel, base_price, cost_price, vendor_id "
                "  FROM products WHERE lower(name) = lower(%s)",
                (line["name"],),
            )
        resolved.append({**line, "product": product})
    return resolved


def _resolve_shift(cur: Any) -> int | None:
    """Shift gudang yang sedang buka.

    Kiosk Pi mengelola shiftnya sendiri di MongoDB dan mengirim
    ``shift_id`` Pi yang tidak ada di gudang. Gudang memakai shift yang
    sedang buka (bila ada) supaya laporan kas/omzet masuk; bila tidak ada
    shift buka, order tetap dibuat tanpa tautan shift daripada ditolak.
    """
    row = _q(
        cur,
        "SELECT id FROM shifts WHERE status IN ('open', 'closing') "
        "ORDER BY opened_at DESC LIMIT 1",
    )
    return int(row["id"]) if row else None


def _resolve_table(cur: Any, code: str | None) -> int | None:
    if not code:
        return None
    row = _q(cur, "SELECT id FROM tables WHERE code = %s OR lower(label) = lower(%s) LIMIT 1",
             (code, code))
    return int(row["id"]) if row else None


def apply_transaction(cur: Any, *, node_id: str, payload: dict) -> dict:
    """Tulis satu transaksi kiosk menjadi orders + order_items + payments.

    Dipanggil di dalam transaksi pemanggil. Melempar :class:`EdgeSyncError`
    bila payload tidak sah — pemanggil menandai baris antrean sebagai
    ``rejected``.
    """
    normalized = normalize_payload(payload)
    if normalized["order_number"]:
        existing = _q(cur, "SELECT id FROM orders WHERE order_number = %s",
                      (normalized["order_number"],))
        if existing:
            raise EdgeSyncError(
                f"nomor order {normalized['order_number']} sudah dipakai di gudang"
            )

    lines = _resolve_products(cur, normalized["lines"])
    price_drifts = _apply_warehouse_prices(normalized, lines)
    channels = [
        (line["product"]["channel"] if line["product"] else line["channel"])
        for line in lines
    ]
    channels = [c for c in channels if c in ("fnb", "retail")]
    if "retail" in channels and "fnb" in channels:
        raise EdgeSyncError("transaksi mencampur item F&B dan retail dalam satu order")
    channel = channels[0] if channels else ("retail" if normalized["order_type"] == "retail" else "fnb")

    created_by = _resolve_user(cur, normalized["cashier_username"])
    shift_id = _resolve_shift(cur)
    table_id = _resolve_table(cur, normalized["table_code"])

    # orders_table_check: dine_in wajib punya meja. Kalau meja Pi tidak
    # ditemukan di gudang, turunkan ke takeaway daripada menolak transaksi.
    order_type = normalized["order_type"]
    if order_type == "dine_in" and table_id is None:
        order_type = "takeaway"

    discount_total = normalized["discount_total"]
    service_total = normalized["service_total"]
    subtotal = normalized["subtotal"]
    grand_total = normalized["grand_total"]
    # orders_totals_check: grand_total = subtotal - discount + service + tax.
    # Payload Pi tidak selalu konsisten (mis. diskon sudah dipotong dari
    # subtotal), jadi total dihitung ulang dari baris bila tidak cocok.
    computed_total = subtotal - discount_total + service_total
    if computed_total != grand_total:
        subtotal = grand_total + discount_total - service_total
        computed_total = grand_total
    grand_total = max(computed_total, 0)

    order_number = normalized["order_number"] or _next_order_number(cur)

    _validate_order_status("paid")
    # P1-I: the INSERT never set `orders.cogs_total`, so every kiosk transaction landed
    # in the ledger with COGS 0 and v_daily_turnover reported a 100% margin. Compute the
    # cost of the lines up-front (same unit_cost the order_items loop below uses) and
    # persist it on the order row.
    total_cogs = 0
    for line in lines:
        product = line["product"]
        unit_cost = int(product["cost_price"]) if product else 0
        total_cogs += _round_idr(Decimal(unit_cost) * line["qty"])

    order = _q(
        cur,
        "INSERT INTO orders (order_number, channel, order_type, status, table_id, shift_id, "
        "                    customer_name, subtotal, discount_total, service_total, "
        "                    grand_total, paid_total, cogs_total, note, created_by, paid_at) "
        "VALUES (%s, %s, %s, 'paid', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, "
        "        COALESCE(%s, now())) "
        "RETURNING id, order_number, grand_total",
        (
            order_number, channel, order_type, table_id, shift_id,
            normalized["customer_name"], subtotal, discount_total, service_total,
            grand_total, grand_total, total_cogs, normalized["note"], created_by,
            normalized["paid_at"],
        ),
    )
    if not order:
        raise EdgeSyncError("gagal menyimpan order")

    for line in lines:
        product = line["product"]
        unit_price = line["unit_price"] or (int(product["base_price"]) if product else 0)
        unit_cost = int(product["cost_price"]) if product else 0
        qty = line["qty"]
        line_total = _round_idr(Decimal(unit_price) * qty)
        _q(
            cur,
            "INSERT INTO order_items (order_id, product_id, product_name, channel, qty, "
            "                        is_weighted, weight_grams, base_price, unit_price, "
            "                        line_subtotal, line_total, unit_cost, line_cost, "
            "                        vendor_id, note) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
            "RETURNING id",
            (
                order["id"], product["id"] if product else None,
                (product["name"] if product else line["name"]), channel, qty,
                bool(line["weight_grams"]), line["weight_grams"],
                int(product["base_price"]) if product else unit_price,
                unit_price, line_total, line_total, unit_cost,
                _round_idr(Decimal(unit_cost) * qty),
                product["vendor_id"] if product else None, line["note"],
            ),
        )
        if product:
            # Stok bahan ikut berkurang bila produk punya resep; konsumsi
            # dicatat lewat inventory_movements supaya laporan HPP gudang
            # tetap berimbang dengan penjualan dari kiosk.
            cur.execute(
                "INSERT INTO inventory_movements (ingredient_id, movement_type, qty_delta, "
                "                                 order_id, order_item_id, reason, created_by) "
                "SELECT r.ingredient_id, 'sale_consumption', -(r.qty_per_unit * %s), %s, "
                "       (SELECT currval('order_items_id_seq')), 'Konsumsi penjualan (kiosk)', %s "
                "  FROM recipes r WHERE r.product_id = %s",
                (qty, order["id"], created_by, product["id"]),
            )
            cur.execute(
                "UPDATE ingredients SET stock_qty = stock_qty + im.qty_delta "
                "  FROM inventory_movements im "
                " WHERE im.order_item_id = (SELECT currval('order_items_id_seq')) "
                "   AND im.ingredient_id = ingredients.id"
            )

    payments = normalized["payments"]
    for index, payment in enumerate(payments):
        if payment["method"] == "cash" and payment["tendered"] is not None:
            # `tendered` adalah uang yang benar-benar diterima kasir dan tidak
            # pernah dinaikkan di sini. Selisih terhadap `amount` (alokasi buku)
            # hanya sah bila dicatat sebagai `tendered_drift`; kalau tidak ada,
            # baris ini ditolak supaya kekurangan kas tidak hilang diam-diam.
            drift = int(payment.get("tendered_drift") or 0)
            if payment["tendered"] + drift < payment["amount"]:
                raise EdgeSyncError(
                    f"tunai diterima {payment['tendered']} kurang dari alokasi "
                    f"{payment['amount']} tanpa tendered_drift"
                )
            change_due = payment["tendered"] + drift - payment["amount"]
        else:
            payment["tendered"] = None
            drift = 0
            change_due = None
        _q(
            cur,
            "INSERT INTO payments (order_id, method, amount, tendered, change_due, tendered_drift, "
            "                      reference_no, idempotency_key, captured_by, shift_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (
                order["id"], payment["method"], payment["amount"], payment["tendered"], change_due,
                drift,
                payment["reference_no"],
                f"edge:{node_id}:{normalized['client_ref'] or order['order_number']}:{index}",
                created_by, shift_id,
            ),
        )

        if payment["method"] == "cash" and shift_id:
            cur.execute(
                "INSERT INTO cash_movements (shift_id, movement_type, direction, amount, "
                "                            reference_type, reference_id, reason, created_by) "
                "VALUES (%s, 'sale_cash', 'in', %s, 'order', %s, %s, %s) "
                "ON CONFLICT DO NOTHING",
                (shift_id, payment["amount"], order["id"], f"Tunai {order['order_number']}", created_by),
            )
            cur.execute(
                "UPDATE shifts SET cash_sales = cash_sales + %s, order_count = order_count + %s "
                " WHERE id = %s",
                (payment["amount"], 1 if index == 0 else 0, shift_id),
            )

    return {
        "order_id": int(order["id"]),
        "order_number": order["order_number"],
        "grand_total": grand_total,
        "channel": channel,
        "shift_id": shift_id,
        "price_drifts": price_drifts,
    }


def _next_order_number(cur: Any) -> str:
    row = _q(
        cur,
        "SELECT to_char(now() AT TIME ZONE current_setting('grandpos.timezone', true), 'YYYYMMDD') AS d",
    )
    day = (row or {}).get("d") or "00000000"
    count = _q(cur, "SELECT count(*) AS n FROM orders WHERE order_number LIKE %s",
               (f"GAK-{day}-%",))
    return f"GAK-{day}-{(count or {}).get('n', 0) + 1:04d}"


def payload_for_log(payload: Any) -> str:
    """Ringkasan aman untuk log — tidak pernah menyertakan payload utuh."""
    if not isinstance(payload, dict):
        return "non-object payload"
    keys = sorted(payload.keys())
    return f"keys={','.join(keys)[:200]}"


def dumps(value: Any) -> str:
    return json.dumps(value, default=str, sort_keys=True)
