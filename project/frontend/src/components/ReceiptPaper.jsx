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
    }
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
      className={`w-full max-w-[340px] bg-white rounded-xl shadow-md border border-[#E5E7EB] p-4 sm:p-5 text-[11px] font-mono text-[#111827] relative select-none leading-relaxed transition-all ${className}`}
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
            <div className="text-[9.5px] mt-0.5 font-normal">Alasan: {order.void_note}</div>
          </div>
        )}

        {/* Logo Display */}
        {logoB64 ? (
          <div className="flex justify-center mb-2">
            <img
              src={logoB64}
              alt="Logo Outlet"
              className="max-h-12 max-w-[120px] object-contain filter contrast-125"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>
        ) : null}

        {/* Outlet Header */}
        <div className={alignClass(headerAlign)}>
          <div className="font-extrabold text-[13px] sm:text-[14px] uppercase tracking-wide text-black">
            {outletName}
          </div>
          {outletAddress && (
            <div className="text-[10px] text-[#4B5563] mt-0.5 leading-snug whitespace-pre-line">
              {outletAddress}
            </div>
          )}
          {outlet?.phone && (
            <div className="text-[9.5px] text-[#6B7280]">Telp: {outlet.phone}</div>
          )}
        </div>
      </div>

      <div className="border-t border-dashed border-[#9CA3AF] my-2" />

      {/* Meta Information */}
      <div className="space-y-1 text-[10.5px]">
        <div className="flex justify-between">
          <span className="text-[#6B7280]">No. Order</span>
          <span className="font-bold text-[#111827]">{order.order_number || "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#6B7280]">Waktu</span>
          <span>{formattedDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#6B7280]">Kasir</span>
          <span>{order.cashier_name || "-"}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[#6B7280]">Layanan</span>
          <span className="px-1.5 py-0.5 rounded bg-[#F3F4F6] text-[9.5px] font-bold uppercase border border-[#E5E7EB]">
            {ORDER_TYPE_LABEL[order.order_type] || order.order_type || "Umum"}
            {order.table_name ? ` • Meja ${order.table_name}` : ""}
          </span>
        </div>
        {order.customer_name && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Pelanggan</span>
            <span className="font-bold">
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
            <div className="flex justify-between items-start font-bold">
              <span className="flex-1 pr-2">{i.name}</span>
              <span className="shrink-0">{rupiah(i.price * i.qty)}</span>
            </div>
            <div className="flex justify-between text-[10px] text-[#6B7280]">
              <span>
                {i.qty} x {rupiah(i.price)}
              </span>
              {i.weight ? (
                <span>
                  ({Number(i.weight).toFixed(2)} {i.weight_unit || "kg"})
                </span>
              ) : null}
            </div>
            {i.notes && (
              <div className="text-[9.5px] text-[#6B7280] italic">* Catatan: {i.notes}</div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-[#9CA3AF] my-2" />

      {/* Calculations Breakdown */}
      <div className="space-y-1 text-[10.5px]">
        <div className="flex justify-between">
          <span className="text-[#6B7280]">Subtotal</span>
          <span>{rupiah(order.subtotal || 0)}</span>
        </div>
        {order.discount ? (
          <div className="flex justify-between text-[#DC2626] font-medium">
            <span>Diskon {order.discount_reason ? `(${order.discount_reason})` : ""}</span>
            <span>-{rupiah(order.discount)}</span>
          </div>
        ) : null}
        {(order.promos_applied || []).map((p, idx) => (
          <div key={idx} className="flex justify-between text-[#DC2626]">
            <span>Promo ({p})</span>
            <span>-{rupiah(order.promo_discount || 0)}</span>
          </div>
        ))}
        {order.coupon_code && (
          <div className="flex justify-between text-[#DC2626]">
            <span>Kupon ({order.coupon_code})</span>
            <span>Terpasang</span>
          </div>
        )}
        {order.redeem_discount ? (
          <div className="flex justify-between text-[#DC2626]">
            <span>Tukar Poin</span>
            <span>-{rupiah(order.redeem_discount)}</span>
          </div>
        ) : null}
        {order.service_tax ? (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Pajak Layanan</span>
            <span>+{rupiah(order.service_tax)}</span>
          </div>
        ) : null}
      </div>

      {/* Total Bayar Box */}
      <div className="my-2.5 p-2 bg-[#F9FAFB] border border-[#D1D5DB] rounded-lg flex justify-between items-center">
        <span className="font-extrabold text-xs tracking-wider">TOTAL BAYAR</span>
        <span className="font-extrabold text-base text-[#111827]">{rupiah(order.total || 0)}</span>
      </div>

      {/* Payment Splits & Change */}
      <div className="space-y-1 text-[10.5px]">
        {paySplits.map((pp, idx) => (
          <div key={idx} className="flex justify-between">
            <span className="text-[#6B7280]">Bayar ({pp.payment_method_name})</span>
            <span className="font-bold">{rupiah(pp.amount)}</span>
          </div>
        ))}
        {order.change > 0 && (
          <div className="flex justify-between items-center text-[#059669] font-bold pt-1">
            <span>Kembalian</span>
            <span className="text-xs bg-[#ECFDF5] px-2 py-0.5 rounded border border-[#A7F3D0]">
              {rupiah(order.change)}
            </span>
          </div>
        )}
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
          className="flex justify-center"
          dangerouslySetInnerHTML={{ __html: barcodeSvgRaw }}
        />
        <div className="text-[9px] tracking-widest font-bold text-[#4B5563] mt-1">
          {order.order_number || "ORDER"}
        </div>
      </div>

      <div className="border-t border-dashed border-[#9CA3AF] my-2.5" />

      {/* Footer Text */}
      <div className={`space-y-1 text-[9.5px] text-[#4B5563] ${alignClass(footerAlign)}`}>
        <div className="font-bold text-black">{footerText}</div>
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
