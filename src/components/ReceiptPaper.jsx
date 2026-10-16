import React, { useEffect, useState } from "react";
import { rupiah, ORDER_TYPE_LABEL } from "@/lib/format";
import { getDeviceConfig } from "@/lib/device";
import { generateBarcodeSvg } from "@/lib/receipt";
import { Sparkles, Store, AlertTriangle } from "lucide-react";

export default function ReceiptPaper({
  order,
  outlet = null,
  cfg: propCfg = null,
  logoUrl: propLogoUrl = null,
  compact = false,
  showCutMarker = true,
  className = "",
}) {
  const [deviceCfg, setDeviceCfg] = useState(propCfg || getDeviceConfig());
  const [logoB64, setLogoB64] = useState(propLogoUrl || "");

  useEffect(() => {
    if (propCfg) {
      setDeviceCfg(propCfg);
    } else {
      setDeviceCfg(getDeviceConfig());
    }
  }, [propCfg]);

  useEffect(() => {
    if (propLogoUrl !== null && propLogoUrl !== undefined) {
      setLogoB64(propLogoUrl);
      return;
    }
    if (outlet?.logo_url) {
      setLogoB64(outlet.logo_url);
      return;
    }
    const cached = localStorage.getItem("gak_logo_b64");
    if (cached) {
      setLogoB64(cached);
      return;
    }

    // Auto-fetch logo dari server bila belum ada di cache/props
    let isMounted = true;
    (async () => {
      try {
        const base = (typeof window !== "undefined" && window.__API_URL__) || "";
        const token = localStorage.getItem("gak_token") || "";
        const res = await fetch(`${base}/api/settings/outlet`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.logo_url && isMounted) {
            setLogoB64(data.logo_url);
            try { localStorage.setItem("gak_logo_b64", data.logo_url); } catch (_) {}
          }
        }
      } catch (_) {}
    })();

    return () => {
      isMounted = false;
    };
  }, [propLogoUrl, outlet]);

  if (!order) {
    return (
      <div className="w-full max-w-[340px] bg-white rounded-xl shadow-md border border-[#E5E7EB] p-6 text-center text-zinc-400 font-mono text-xs">
        <Store size={28} className="mx-auto mb-2 text-zinc-300" />
        <div>Tidak ada data transaksi untuk ditampilkan</div>
      </div>
    );
  }

  const cfg = propCfg || deviceCfg || {};
  const outletName = cfg.outletName || outlet?.name || "GRANDPOS OPTIMA";
  const outletAddress = cfg.outletAddress || outlet?.address || "";
  const headerAlign = cfg.headerAlign || "center";
  const footerAlign = cfg.footerAlign || "center";
  const footerText = cfg.footerText || "Terima kasih atas kunjungan Anda!";

  const alignClass = (a) => (a === "left" ? "text-left" : a === "right" ? "text-right" : "text-center");

  const formattedDate = new Date(order.paid_at || order.created_at || Date.now()).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const paySplits =
    order.payment_splits && order.payment_splits.length
      ? order.payment_splits
      : order.payment_method_name
      ? [{ payment_method_name: order.payment_method_name, amount: order.amount_paid || order.total }]
      : [];

  const barcodeSvgRaw = generateBarcodeSvg(order.order_number || "ORDER", 28);

  return (
    <div
      data-testid="receipt-paper"
      className={`w-full max-w-[340px] sm:max-w-[360px] h-auto min-h-min bg-white rounded-xl shadow-md border border-[#E5E7EB] p-4 sm:p-5 text-[11px] font-mono text-[#111827] relative select-none leading-relaxed transition-all self-start ${className}`}
    >
      {/* Top Paper Notch / Header Marker */}
      <div className="text-center pb-2">
        {order.offline && (
          <div
            data-testid="offline-receipt-badge"
            className="inline-block bg-[#0A0A0A] text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full mb-1.5 uppercase tracking-wider"
          >
            STRUK OFFLINE — BELUM SINKRON
          </div>
        )}
        {order.void_note && (
          <div className="border-2 border-[#EF4444] bg-[#FEF2F2] text-[#B91C1C] p-2 rounded-lg text-center font-bold mb-2">
            <div className="flex items-center justify-center gap-1 text-xs">
              <AlertTriangle size={14} /> TRANSAKSI DIBATALKAN
            </div>
            <div className="text-[9.5px] mt-0.5 font-normal break-words">Alasan: {order.void_note}</div>
          </div>
        )}

        {/* Logo Display */}
        {logoB64 ? (
          <div className={`flex ${headerAlign === "left" ? "justify-start" : headerAlign === "right" ? "justify-end" : "justify-center"} mb-2.5`}>
            <img
              src={logoB64}
              alt="Logo Outlet"
              className="max-h-14 sm:max-h-16 max-w-[130px] sm:max-w-[150px] object-contain filter contrast-125 select-none drop-shadow-xs"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>
        ) : null}

        {/* Outlet Header */}
        <div className={alignClass(headerAlign)}>
          <div className="font-extrabold text-[13px] sm:text-[14px] uppercase tracking-wide text-black break-words">
            {outletName}
          </div>
          {outletAddress && (
            <div className="text-[10px] text-[#4B5563] mt-0.5 leading-snug whitespace-pre-line break-words">
              {outletAddress}
            </div>
          )}
          {outlet?.phone && (
            <div className="text-[9.5px] text-[#6B7280] break-words">Telp: {outlet.phone}</div>
          )}
        </div>
      </div>

      <div className="border-t border-dashed border-[#9CA3AF] my-2" />

      {/* Meta Information */}
      <div className="space-y-1 text-[10.5px]">
        <div className="flex justify-between items-start gap-2">
          <span className="text-[#6B7280] shrink-0">No. Order</span>
          <span className="font-bold text-[#111827] text-right break-all">{order.order_number || "-"}</span>
        </div>
        <div className="flex justify-between items-start gap-2">
          <span className="text-[#6B7280] shrink-0">Waktu</span>
          <span className="text-right whitespace-nowrap">{formattedDate}</span>
        </div>
        <div className="flex justify-between items-start gap-2">
          <span className="text-[#6B7280] shrink-0">Kasir</span>
          <span className="text-right break-words">{order.cashier_name || "-"}</span>
        </div>
        <div className="flex justify-between items-center gap-2">
          <span className="text-[#6B7280] shrink-0">Layanan</span>
          <span className="px-1.5 py-0.5 rounded bg-[#F3F4F6] text-[9.5px] font-bold uppercase border border-[#E5E7EB] text-right break-words">
            {ORDER_TYPE_LABEL[order.order_type] || order.order_type || "Umum"}
            {order.table_name ? ` • Meja ${order.table_name}` : ""}
          </span>
        </div>
        {order.customer_name && (
          <div className="flex justify-between items-start gap-2">
            <span className="text-[#6B7280] shrink-0">Pelanggan</span>
            <span className="font-bold text-right break-words">
              {order.customer_name}
              {order.customer_phone ? ` (${order.customer_phone})` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-dashed border-[#9CA3AF] my-2" />

      {/* Items Table */}
      <div className="space-y-2 py-0.5">
        {(order.items || []).map((i, idx) => (
          <div key={idx} className="space-y-0.5">
            <div className="flex justify-between items-start gap-2 font-bold">
              <span className="flex-1 break-words leading-tight">{i.name || "Produk"}</span>
              <span className="shrink-0 text-right whitespace-nowrap">{rupiah((i.price || 0) * (i.qty || 1))}</span>
            </div>
            <div className="flex justify-between text-[10px] text-[#6B7280]">
              <span>
                {i.qty || 1} x {rupiah(i.price || 0)}
              </span>
              {i.weight ? (
                <span>
                  ({Number(i.weight).toFixed(2)} {i.weight_unit || "kg"})
                </span>
              ) : null}
            </div>
            {i.notes && (
              <div className="text-[9.5px] text-[#6B7280] italic break-words">* Catatan: {i.notes}</div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-[#9CA3AF] my-2" />

      {/* Calculations Breakdown */}
      <div className="space-y-1 text-[10.5px]">
        <div className="flex justify-between items-center">
          <span className="text-[#6B7280]">Subtotal</span>
          <span className="font-medium font-num">{rupiah(order.subtotal || 0)}</span>
        </div>
        {order.discount ? (
          <div className="flex justify-between items-center text-[#DC2626] font-medium">
            <span className="break-words">Diskon {order.discount_reason ? `(${order.discount_reason})` : ""}</span>
            <span className="font-num">-{rupiah(order.discount)}</span>
          </div>
        ) : null}
        {(order.promos_applied || []).map((p, idx) => (
          <div key={idx} className="flex justify-between items-center text-[#DC2626]">
            <span className="break-words">Promo ({p})</span>
            <span className="font-num">-{rupiah(order.promo_discount || 0)}</span>
          </div>
        ))}
        {order.coupon_code && (
          <div className="flex justify-between items-center text-[#DC2626]">
            <span className="break-words">Kupon ({order.coupon_code})</span>
            <span>Terpasang</span>
          </div>
        )}
        {order.redeem_discount ? (
          <div className="flex justify-between items-center text-[#DC2626]">
            <span>Tukar Poin</span>
            <span className="font-num">-{rupiah(order.redeem_discount)}</span>
          </div>
        ) : null}
        {order.service_tax ? (
          <div className="flex justify-between items-center">
            <span className="text-[#6B7280]">Pajak Layanan</span>
            <span className="font-num">+{rupiah(order.service_tax)}</span>
          </div>
        ) : null}
      </div>

      {/* Total Bayar Box */}
      <div className="my-2.5 p-2.5 bg-[#F9FAFB] border border-[#D1D5DB] rounded-lg flex justify-between items-center">
        <span className="font-extrabold text-xs tracking-wider">TOTAL BAYAR</span>
        <span className="font-extrabold text-base text-[#111827] font-num">{rupiah(order.total || 0)}</span>
      </div>

      {/* Payment Details & Change */}
      <div className="space-y-1 text-[10.5px]">
        {paySplits.length > 0 ? (
          paySplits.map((pp, idx) => (
            <div key={idx} className="flex justify-between items-center">
              <span className="text-[#6B7280]">Bayar ({pp.payment_method_name})</span>
              <span className="font-bold font-num">{rupiah(pp.amount)}</span>
            </div>
          ))
        ) : (
          <div className="flex justify-between items-center">
            <span className="text-[#6B7280]">Metode Bayar</span>
            <span className="font-bold">{order.payment_method_name || "Tunai"}</span>
          </div>
        )}

        {/* Cash Amount Paid & Change for Cash Transactions */}
        {order.amount_paid !== undefined && order.amount_paid !== null && order.amount_paid > 0 && (
          <div className="flex justify-between items-center text-zinc-600">
            <span>Uang Diterima</span>
            <span className="font-bold font-num">{rupiah(order.amount_paid)}</span>
          </div>
        )}

        {order.change !== undefined && order.change !== null && order.change > 0 ? (
          <div className="flex justify-between items-center text-[#059669] font-black pt-1 border-t border-dashed border-[#D1D5DB]">
            <span className="uppercase text-[10px] tracking-wider">Kembalian</span>
            <span className="text-xs bg-[#ECFDF5] px-2 py-0.5 rounded border border-[#A7F3D0] font-mono font-num">
              {rupiah(order.change)}
            </span>
          </div>
        ) : order.amount_paid && order.amount_paid === order.total ? (
          <div className="flex justify-between items-center text-zinc-500 font-bold pt-1 border-t border-dashed border-[#E5E7EB] text-[10px]">
            <span>Kembalian</span>
            <span>Rp 0 (Uang Pas)</span>
          </div>
        ) : null}
      </div>

      {/* Loyalty Points Badge */}
      {order.points_earned ? (
        <div className="mt-3 p-2 bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-[10px] rounded-lg text-center font-bold flex items-center justify-center gap-1.5">
          <Sparkles size={12} />
          <span>+ {order.points_earned} Poin Member Diperoleh</span>
        </div>
      ) : null}

      {/* Barcode Section */}
      <div className="mt-3 pt-2 text-center">
        <div
          className="flex justify-center overflow-hidden"
          dangerouslySetInnerHTML={{ __html: barcodeSvgRaw }}
        />
        <div className="text-[9px] tracking-widest font-bold text-[#4B5563] mt-1 break-all">
          {order.order_number || "ORDER"}
        </div>
      </div>

      <div className="border-t border-dashed border-[#9CA3AF] my-2.5" />

      {/* Footer Text */}
      <div className={`space-y-1 text-[9.5px] text-[#4B5563] ${alignClass(footerAlign)}`}>
        <div className="font-bold text-black whitespace-pre-line break-words">{footerText}</div>
        <div className="text-[9px] text-[#6B7280]">Simpan struk ini sebagai bukti pembayaran resmi</div>
        <div className="text-[8.5px] text-[#9CA3AF] pt-0.5">Powered by GrandPOS Optima</div>
      </div>

      {/* Bottom Tear Marker */}
      {showCutMarker && (
        <div className="mt-3 pt-1 text-center text-[8.5px] text-[#9CA3AF] tracking-wider">
          - - - - - - ✂ POTONG DI SINI ✂ - - - - - -
        </div>
      )}
    </div>
  );
}
