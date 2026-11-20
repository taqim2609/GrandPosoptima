#!/usr/bin/env python3
"""GrandPOS MCP Server — Model Context Protocol untuk Business Analyst.

Expose tool analytics ke Hermes via HTTP/SSE. Server ini berjalan terpisah
dari API utama (port 8001 default) dan mengakses PostgreSQL langsung dengan
transaksi READ ONLY (tidak ada tool yang menulis data).

Run:
    ./venv_mcp/bin/python app/mcp_server.py

Env:
    MCP_DATABASE_URL — DSN eksplisit (opsional, menang atas yang lain)
    DATABASE_URL — DSN libpq; kalau kosong dipakai isi repo .env
    MCP_DB_USE_AI_ROLE=1 — pakai AI_DATABASE_URL (hanya view analitik)
    GRANDPOS_ENV_FILE — path .env alternatif
    GRANDPOS_TZ — timezone bisnis (default Asia/Jakarta)
    MCP_PORT — port server (default 8001)
    MCP_HOST — bind host (default 127.0.0.1)
"""

import asyncio
import logging
import os
import sys
from pathlib import Path

# Allow `python app/mcp_server.py` from any working directory: the repo root must
# be importable so `app.mcp_reports` resolves (the systemd unit runs the file by
# path, which puts `app/` — not the repo root — on sys.path).
_REPO_ROOT = str(Path(__file__).resolve().parent.parent)
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from app.db import business_today

from mcp.server import MCPServer  # noqa: E402

from app import mcp_reports  # noqa: E402
from app.mcp_db import describe_target, query  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("grandpos-mcp")

# ── MCP Server ───────────────────────────────────────────────────────────────

app = MCPServer("grandpos")


def _render(fn, **kwargs) -> str:
    """Run a report function and render it as text; never raise raw tracebacks."""
    title = fn.__name__.replace("_", " ").title()
    try:
        return mcp_reports._format_response(fn(**kwargs), title=title)
    except ValueError as exc:
        return f"❌ Parameter tidak valid: {exc}"
    except Exception as exc:  # noqa: BLE001 - surfaced to the analyst as text
        logger.exception("report failed")
        return f"❌ Gagal menjalankan laporan: {type(exc).__name__}: {exc}"


@app.tool()
def sales_today() -> str:
    """Total penjualan hari ini: omzet, jumlah transaksi, rata-rata ticket."""
    today = business_today().isoformat()
    rows = query(
        """
        SELECT COUNT(*) as transactions,
               COALESCE(SUM(grand_total), 0) as revenue,
               COALESCE(AVG(grand_total), 0) as avg_ticket
        FROM orders
        WHERE (created_at AT TIME ZONE current_setting('grandpos.timezone', true))::date = %s
          AND status = 'paid'
        """,
        (today,),
    )
    r = rows[0]
    return (
        f"📊 Penjualan Hari Ini ({today}):\n"
        f"  Transaksi: {r['transactions'] or 0}\n"
        f"  Omzet: {mcp_reports._format_money(r['revenue'])}\n"
        f"  Rata-rata: {mcp_reports._format_money(r['avg_ticket'])}"
    )


@app.tool()
def shift_current() -> str:
    """Shift kasir yang sedang aktif: kasir, waktu mulai, saldo awal."""
    rows = query(
        """
        SELECT s.id, u.username as cashier, s.opened_at, s.opening_float
        FROM shifts s
        JOIN users u ON s.cashier_id = u.id
        WHERE s.closed_at IS NULL
        ORDER BY s.opened_at DESC
        LIMIT 1
        """
    )
    if not rows:
        return "❌ Tidak ada shift aktif saat ini."
    r = rows[0]
    return (
        f"🔄 Shift Aktif:\n"
        f"  Kasir: {r['cashier']}\n"
        f"  Mulai: {r['opened_at']}\n"
        f"  Saldo Awal: {mcp_reports._format_money(r['opening_float'])}"
    )


@app.tool()
def menu_popular() -> str:
    """Top 5 menu terlaris hari ini beserta jumlah terjual."""
    today = business_today().isoformat()
    rows = query(
        """
        SELECT oi.product_name as name, SUM(oi.qty) as qty, SUM(oi.line_total) as revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE (o.created_at AT TIME ZONE current_setting('grandpos.timezone', true))::date = %s
          AND o.status = 'paid'
        GROUP BY oi.product_name
        ORDER BY qty DESC
        LIMIT 5
        """,
        (today,),
    )
    lines = [f"🔥 Top Menu Hari Ini ({today}):"]
    for i, r in enumerate(rows, 1):
        lines.append(
            f"  {i}. {r['name']} — {r['qty']} porsi "
            f"({mcp_reports._format_money(r['revenue'])})"
        )
    if not rows:
        lines.append("  (Belum ada penjualan)")
    return "\n".join(lines)


@app.tool()
def vendor_settlement_today() -> str:
    """Rekap settlement vendor hari ini: total, status, jumlah vendor."""
    today = business_today().isoformat()
    rows = query(
        """
        SELECT COUNT(*) as count,
               COALESCE(SUM(vendor_amount), 0) as total,
               COUNT(*) FILTER (WHERE status = 'paid') as settled_count,
               COALESCE(SUM(vendor_amount) FILTER (WHERE status = 'paid'), 0) as settled_total
        FROM vendor_settlements
        WHERE (created_at AT TIME ZONE current_setting('grandpos.timezone', true))::date = %s
        """,
        (today,),
    )
    r = rows[0]
    return (
        f"🏪 Vendor Settlement ({today}):\n"
        f"  Total: {r['count']} vendor — {mcp_reports._format_money(r['total'])}\n"
        f"  Sudah Settle: {r['settled_count']} — "
        f"{mcp_reports._format_money(r['settled_total'])}\n"
        f"  Sisa: {r['count'] - r['settled_count']} vendor"
    )


@app.tool()
def cash_variance() -> str:
    """Selisih kas (variance) shift-shift hari ini: positif/negatif/Rp0."""
    today = business_today().isoformat()
    rows = query(
        """
        SELECT id, variance, closed_at
        FROM shifts
        WHERE (closed_at AT TIME ZONE current_setting('grandpos.timezone', true))::date = %s
          AND variance IS NOT NULL
        ORDER BY closed_at DESC
        """,
        (today,),
    )
    lines = [f"💰 Variance Kas ({today}):"]
    for r in rows:
        sign = "✅" if r["variance"] == 0 else ("⚠️ +" if r["variance"] > 0 else "🔴")
        lines.append(
            f"  Shift {r['id']}: {sign} "
            f"{mcp_reports._format_money(r['variance'])}"
        )
    if not rows:
        lines.append("  (Belum ada shift ditutup hari ini)")
    return "\n".join(lines)


@app.tool()
def stock_low() -> str:
    """Daftar bahan/menu yang stoknya di bawah threshold minimum."""
    rows = query(
        """
        SELECT name, stock_qty, min_stock_qty, shortage_qty
        FROM v_low_stock
        WHERE is_low = true
        ORDER BY shortage_qty DESC
        LIMIT 10
        """
    )
    lines = ["⚠️ Stok Rendah:"]
    for r in rows:
        lines.append(f"  • {r['name']}: {r['stock_qty']} (min: {r['min_stock_qty']}, kurang: {r['shortage_qty']})")
    if not rows:
        lines.append("  (Semua stok aman)")
    return "\n".join(lines)


# ── Tool baru: laporan historis (READ ONLY, berparameter) ────────────────────


@app.tool()
def sales_report(
    date_from: str | None = None,
    date_to: str | None = None,
    status: str | None = None,
    channel: str | None = None,
    shift_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Laporan transaksi/penjualan historis dengan rentang tanggal dan paging.

    Args:
        date_from: tanggal awal YYYY-MM-DD (default: tanpa batas awal)
        date_to: tanggal akhir YYYY-MM-DD (default: tanpa batas akhir)
        status: filter status order: open | paid | void
        channel: filter channel: fnb | retail
        shift_id: filter satu shift
        limit: baris per halaman (1-500, default 50)
        offset: mulai dari baris ke-N untuk halaman berikutnya

    Rentang maksimum 366 hari. Totals (subtotal, diskon, pajak, grand total,
    COGS) dihitung atas seluruh hasil filter, bukan hanya halaman ini.
    """
    return _render(
        mcp_reports.sales,
        date_from=date_from,
        date_to=date_to,
        status=status,
        channel=channel,
        shift_id=shift_id,
        limit=limit,
        offset=offset,
    )


@app.tool()
def order_items_report(
    date_from: str | None = None,
    date_to: str | None = None,
    product_id: int | None = None,
    product_name: str | None = None,
    channel: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Laporan item terjual / performa menu: qty, omzet, COGS, gross margin.

    Args:
        date_from: tanggal awal YYYY-MM-DD
        date_to: tanggal akhir YYYY-MM-DD
        product_id: filter satu produk
        product_name: cari nama produk (pencocokan sebagian)
        channel: filter channel: fnb | retail
        status: filter status item: active | void
        limit: baris per halaman (1-500)
        offset: offset halaman
    """
    return _render(
        mcp_reports.order_items,
        date_from=date_from,
        date_to=date_to,
        product_id=product_id,
        product_name=product_name,
        channel=channel,
        status=status,
        limit=limit,
        offset=offset,
    )


@app.tool()
def payments_report(
    date_from: str | None = None,
    date_to: str | None = None,
    method: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Laporan pembayaran: metode, nominal, tunai/kembalian, status.

    Args:
        date_from: tanggal awal YYYY-MM-DD
        date_to: tanggal akhir YYYY-MM-DD
        method: cash | qris | debit | credit | transfer | voucher
        status: captured | voided
        limit: baris per halaman (1-500)
        offset: offset halaman
    """
    return _render(
        mcp_reports.payments,
        date_from=date_from,
        date_to=date_to,
        method=method,
        status=status,
        limit=limit,
        offset=offset,
    )


@app.tool()
def shifts_report(
    date_from: str | None = None,
    date_to: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Laporan shift kasir: kas masuk/keluar, kas seharusnya, variance.

    Args:
        date_from: tanggal buka shift awal YYYY-MM-DD
        date_to: tanggal buka shift akhir YYYY-MM-DD
        status: open | closing | closed
        limit: baris per halaman (1-500)
        offset: offset halaman
    """
    return _render(
        mcp_reports.shifts,
        date_from=date_from,
        date_to=date_to,
        status=status,
        limit=limit,
        offset=offset,
    )


@app.tool()
def cash_movements_report(
    date_from: str | None = None,
    date_to: str | None = None,
    shift_id: int | None = None,
    movement_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Laporan pergerakan kas (laci): float, penjualan tunai, kas masuk/keluar.

    Args:
        date_from: tanggal awal YYYY-MM-DD
        date_to: tanggal akhir YYYY-MM-DD
        shift_id: filter satu shift
        movement_type: opening_float | sale_cash | sale_cash_reversal |
            cash_in | cash_out | vendor_settlement |
            vendor_settlement_reversal | void_reversal | closing_adjustment
        limit: baris per halaman (1-500)
        offset: offset halaman
    """
    return _render(
        mcp_reports.cash_movements,
        date_from=date_from,
        date_to=date_to,
        shift_id=shift_id,
        movement_type=movement_type,
        limit=limit,
        offset=offset,
    )


@app.tool()
def inventory_movements_report(
    date_from: str | None = None,
    date_to: str | None = None,
    ingredient_id: int | None = None,
    movement_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Laporan pergerakan stok bahan: pembelian, pemakaian, koreksi, waste.

    Args:
        date_from: tanggal awal YYYY-MM-DD
        date_to: tanggal akhir YYYY-MM-DD
        ingredient_id: filter satu bahan
        movement_type: purchase | sale_consumption | adjustment | waste | reversal
        limit: baris per halaman (1-500)
        offset: offset halaman
    """
    return _render(
        mcp_reports.inventory_movements,
        date_from=date_from,
        date_to=date_to,
        ingredient_id=ingredient_id,
        movement_type=movement_type,
        limit=limit,
        offset=offset,
    )


@app.tool()
def vendor_settlements_report(
    date_from: str | None = None,
    date_to: str | None = None,
    vendor_id: int | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Laporan settlement vendor: penjualan kotor, komisi, jumlah dibayar.

    Args:
        date_from: tanggal awal YYYY-MM-DD
        date_to: tanggal akhir YYYY-MM-DD
        vendor_id: filter satu vendor
        status: draft | paid | void
        limit: baris per halaman (1-500)
        offset: offset halaman
    """
    return _render(
        mcp_reports.vendor_settlements,
        date_from=date_from,
        date_to=date_to,
        vendor_id=vendor_id,
        status=status,
        limit=limit,
        offset=offset,
    )


@app.tool()
def products_report(
    active_only: bool = True,
    category_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Laporan katalog produk/menu: harga jual, harga pokok, status aktif.

    Args:
        active_only: hanya produk aktif (default true)
        category_id: filter satu kategori
        limit: baris per halaman (1-500)
        offset: offset halaman
    """
    return _render(
        mcp_reports.products,
        active_only=active_only,
        category_id=category_id,
        limit=limit,
        offset=offset,
    )


@app.tool()
def low_stock_report(limit: int = 50, offset: int = 0) -> str:
    """Laporan bahan di bawah stok minimum, urut dari kekurangan terbesar.

    Args:
        limit: jumlah baris per halaman (1-500)
        offset: offset halaman
    """
    return _render(mcp_reports.low_stock, limit=limit, offset=offset)


@app.tool()
def daily_turnover_report(
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Omzet harian per shift dan channel dari view analitik v_daily_turnover.

    Args:
        date_from: tanggal awal YYYY-MM-DD
        date_to: tanggal akhir YYYY-MM-DD
        limit: baris per halaman (1-500)
        offset: offset halaman
    """
    return _render(
        mcp_reports.daily_turnover,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@app.tool()
def members_report(
    active_only: bool = True,
    tier: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Laporan member: kode, tier, poin, total belanja (tanpa PII telepon/email).

    Args:
        active_only: hanya member aktif (default true)
        tier: filter tier member
        limit: baris per halaman (1-500)
        offset: offset halaman
    """
    return _render(
        mcp_reports.members,
        active_only=active_only,
        tier=tier,
        limit=limit,
        offset=offset,
    )


@app.tool()
def audit_logs_report(
    date_from: str | None = None,
    date_to: str | None = None,
    entity_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Laporan audit trail: waktu, entitas, aksi, aktor, alasan.

    Args:
        date_from: tanggal awal YYYY-MM-DD
        date_to: tanggal akhir YYYY-MM-DD
        entity_type: filter jenis entitas, mis. orders / shifts
        limit: baris per halaman (1-500)
        offset: offset halaman
    """
    return _render(
        mcp_reports.audit_logs,
        date_from=date_from,
        date_to=date_to,
        entity_type=entity_type,
        limit=limit,
        offset=offset,
    )


@app.tool()
def report_query(
    report: str,
    date_from: str | None = None,
    date_to: str | None = None,
    filter_key: str | None = None,
    filter_value: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Pintu tunggal ke semua laporan: pilih nama report + rentang + paging.

    Args:
        report: nama report. Pilihan: sales, order_items, payments, shifts,
            cash_movements, inventory_movements, vendor_settlements, products,
            low_stock, daily_turnover, members, audit_logs
        date_from: tanggal awal YYYY-MM-DD (diabaikan untuk products/low_stock)
        date_to: tanggal akhir YYYY-MM-DD
        filter_key: nama filter opsional, mis. status / channel / method /
            movement_type / vendor_id / ingredient_id / product_id / tier
        filter_value: nilai filter; untuk *_id harus berupa angka
        limit: baris per halaman (1-500, default 50)
        offset: offset halaman untuk menarik halaman berikutnya

    Nama report divalidasi terhadap allowlist; SQL bebas tidak pernah diterima.
    Untuk mengambil seluruh data, ulangi panggilan dengan
    offset = offset + limit selama pagination.has_more bernilai true.
    """
    try:
        response = mcp_reports.paginated(
            report_name=report,
            date_from=date_from,
            date_to=date_to,
            filter_key=filter_key,
            filter_value=filter_value,
            limit=limit,
            offset=offset,
        )
    except ValueError as exc:
        return f"❌ Parameter tidak valid: {exc}"
    except Exception as exc:  # noqa: BLE001 - surfaced to the analyst as text
        logger.exception("report_query failed")
        return f"❌ Gagal menjalankan laporan: {type(exc).__name__}: {exc}"
    return mcp_reports._format_response(response, title=report)


@app.tool()
def reports_catalog() -> str:
    """Katalog semua laporan yang tersedia beserta filter dan batasannya.

    Panggil tool ini dulu kalau belum yakin report mana yang menjawab
    pertanyaan. Semua laporan READ ONLY, maksimal 500 baris per panggilan,
    rentang tanggal maksimal 366 hari.
    """
    lines = [
        "📚 Katalog Laporan GrandPOS (semua READ ONLY)",
        f"  Sumber data: {describe_target()}",
        "  Batas: limit 1-500 baris/panggilan, rentang tanggal maks 366 hari.",
        "",
        "  1. sales — transaksi & omzet. filter: status, channel, shift_id",
        "  2. order_items — item terjual/menu. filter: product_id, product_name, channel, status",
        "  3. payments — pembayaran. filter: method, status",
        "  4. shifts — shift & variance kas. filter: status",
        "  5. cash_movements — pergerakan laci. filter: shift_id, movement_type",
        "  6. inventory_movements — stok bahan. filter: ingredient_id, movement_type",
        "  7. vendor_settlements — settlement vendor. filter: vendor_id, status",
        "  8. products — katalog menu (tanpa tanggal). filter: category_id, active_only",
        "  9. low_stock — stok di bawah minimum (tanpa tanggal)",
        " 10. daily_turnover — omzet harian per shift/channel",
        " 11. members — member & poin (tanpa PII telepon/email). filter: tier",
        " 12. audit_logs — audit trail. filter: entity_type",
        "",
        "Cara paging: report_query(report=..., limit=100, offset=0), lalu",
        "ulangi dengan offset = offset + limit selama pagination.has_more true.",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    host = os.getenv("MCP_HOST", "127.0.0.1")
    port = int(os.getenv("MCP_PORT", "8001"))
    logger.info(
        "GrandPOS MCP Server starting on %s:%d (db: %s)", host, port, describe_target()
    )
    asyncio.run(app.run_sse_async(host=host, port=port))
