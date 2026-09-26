import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Copy, Check, Printer, MessageCircle, Send, Loader2, X, Image as ImageIcon, Upload } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { printReceipt } from "@/lib/receipt";
import { rupiah, ORDER_TYPE_LABEL } from "@/lib/format";
import ReceiptPaper from "./ReceiptPaper";

export default function ReceiptModal({
  order,
  open,
  onClose,
  title = "Transaksi Sukses",
  subtitle = "Pembayaran telah dicatat & diverifikasi",
  showNewTransactionBtn = true,
  outlet: propOutlet = null,
  cfg = null,
}) {
  const [waPhone, setWaPhone] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [showWaInput, setShowWaInput] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentLogo, setCurrentLogo] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

  useEffect(() => {
    if (order) {
      setWaPhone(order.customer_phone || "");
      setShowWaInput(false);
      setCopied(false);
    }
  }, [order]);

  useEffect(() => {
    const cached = localStorage.getItem("gak_logo_b64");
    if (cached) {
      setCurrentLogo(cached);
    } else if (propOutlet?.logo_url) {
      setCurrentLogo(propOutlet.logo_url);
    }
  }, [propOutlet]);

  if (!order && !open) return null;

  const handleUploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/settings/outlet/logo", fd);
      const url = res.data?.url;
      if (url) {
        setCurrentLogo(url);
        try { localStorage.setItem("gak_logo_b64", url); } catch (_) {}
        toast.success("Logo toko berhasil dipasang pada struk!");
      }
    } catch (err) {
      toast.error("Gagal mengunggah logo: " + (err.response?.data?.detail || err.message));
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleCopyText = () => {
    if (!order) return;
    const lines = [
      "================================",
      `       ${cfg?.outletName || outlet?.name || "GRANDPOS OPTIMA"}`,
      ...(cfg?.outletAddress || outlet?.address ? [cfg?.outletAddress || outlet?.address] : []),
      "================================",
      `No. Order : ${order.order_number}`,
      `Tanggal   : ${new Date(order.paid_at || order.created_at || Date.now()).toLocaleString("id-ID")}`,
      `Kasir     : ${order.cashier_name || "-"}`,
      `Layanan   : ${ORDER_TYPE_LABEL[order.order_type] || order.order_type || "Umum"}${order.table_name ? ` (Meja ${order.table_name})` : ""}`,
      ...(order.customer_name ? [`Pelanggan : ${order.customer_name}`] : []),
      "--------------------------------",
      ...(order.items || []).map((i) => `${i.name}\n  ${i.qty} x ${rupiah(i.price)} = ${rupiah(i.price * i.qty)}`),
      "--------------------------------",
      `Subtotal  : ${rupiah(order.subtotal || 0)}`,
      order.discount ? `Diskon    : -${rupiah(order.discount)}` : null,
      order.service_tax ? `Pajak     : +${rupiah(order.service_tax)}` : null,
      `TOTAL     : ${rupiah(order.total || 0)}`,
      order.payment_method_name ? `Bayar (${order.payment_method_name}): ${rupiah(order.amount_paid || order.total)}` : null,
      order.change ? `Kembali   : ${rupiah(order.change)}` : null,
      "================================",
      cfg?.footerText || "Terima Kasih Atas Kunjungan Anda",
    ].filter(Boolean).join("\n");

    try {
      navigator.clipboard?.writeText(lines);
      setCopied(true);
      toast.success("Teks struk berhasil disalin ke clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      toast.error("Gagal menyalin teks");
    }
  };

  const sendWaReceipt = async () => {
    if (!waPhone.trim()) {
      toast.error("Masukkan nomor WhatsApp pelanggan");
      return;
    }
    setWaSending(true);
    try {
      const res = await api.post("/whatsapp/send-receipt", {
        to: waPhone.trim(),
        order_number: order.order_number,
        total: order.total,
        customer_name: order.customer_name || "Pelanggan",
      });
      toast.success(res.data?.message || "Struk WhatsApp berhasil dikirim!");
      setShowWaInput(false);
    } catch (e) {
      toast.error("Gagal mengirim struk via WhatsApp");
    } finally {
      setWaSending(false);
    }
  };

  const handlePrint = () => {
    if (!order) return;
    printReceipt(order);
  };

  return (
    <Dialog open={open ?? !!order} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[92dvh] sm:max-h-[88vh] overflow-hidden flex flex-col p-0 bg-[#F4F5F7] border border-[#E4E4E7] shadow-2xl rounded-2xl">
        {/* Header Title */}
        <div className="p-4 pb-3 bg-white border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#ECFDF5] text-[#059669] grid place-items-center font-bold">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <DialogTitle className="font-extrabold text-base text-[#111827] leading-tight">{title}</DialogTitle>
              <p className="text-xs text-[#6B7280]">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={handleUploadLogo}
            />
            <button
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              title={currentLogo ? "Ganti logo struk" : "Unggah logo toko ke struk"}
              className="tap h-8 px-2.5 rounded-lg border bg-[#FAFAFA] hover:bg-[#F3F4F6] text-xs font-bold text-[#374151] flex items-center gap-1.5 disabled:opacity-50"
            >
              {uploadingLogo ? (
                <Loader2 size={13} className="animate-spin text-[#E63946]" />
              ) : (
                <ImageIcon size={13} className="text-[#E63946]" />
              )}
              <span className="hidden sm:inline">{currentLogo ? "Ganti Logo" : "Pasang Logo"}</span>
            </button>
            <button
              onClick={handleCopyText}
              title="Salin teks struk"
              className="tap h-8 px-2.5 rounded-lg border bg-[#FAFAFA] hover:bg-[#F3F4F6] text-xs font-bold text-[#374151] flex items-center gap-1.5"
            >
              {copied ? <Check size={13} className="text-[#059669]" /> : <Copy size={13} />}
              <span>{copied ? "Disalin" : "Salin"}</span>
            </button>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6] grid place-items-center"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Highlight Banner Kembalian */}
        {order && order.change > 0 && (
          <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between shadow-xs border-b border-emerald-700 shrink-0" data-testid="receipt-modal-change-banner">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-emerald-200 flex items-center gap-1">
                KEMBALIAN UANG TUNAI
              </div>
              <div className="text-2xl font-black font-num tracking-tight">{rupiah(order.change)}</div>
            </div>
            <div className="text-right text-[11px] text-emerald-100">
              <div>Total: <strong className="text-white font-num">{rupiah(order.total)}</strong></div>
              <div>Diterima: <strong className="text-white font-num">{rupiah(order.amount_paid || order.total)}</strong></div>
            </div>
          </div>
        )}

        {/* Scrollable Receipt Paper Preview Container */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 flex justify-center items-start bg-[#F4F5F7]">
          {order && (
            <ReceiptPaper
              order={order}
              outlet={propOutlet}
              logoUrl={currentLogo}
              cfg={cfg}
            />
          )}
        </div>

        {/* WhatsApp Drawer / Accordion */}
        {showWaInput && (
          <div className="px-4 py-3 bg-[#F0FDF4] border-t border-[#BBF7D0] space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-extrabold text-[#166534] uppercase tracking-wider flex items-center gap-1.5">
                <MessageCircle size={14} /> Kirim Struk Digital via WhatsApp
              </label>
              <button onClick={() => setShowWaInput(false)} className="text-xs text-[#166534] hover:underline">
                Tutup
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="Contoh: 08123456789"
                className="flex-1 h-10 rounded-xl border border-[#86EFAC] px-3 text-xs font-mono bg-white outline-none focus:ring-2 focus:ring-[#16A34A]"
              />
              <button
                onClick={sendWaReceipt}
                disabled={waSending}
                className="tap h-10 px-4 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {waSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Kirim
              </button>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              data-testid="print-receipt-btn"
              onClick={handlePrint}
              className="tap h-12 rounded-xl bg-[#0A0A0A] hover:bg-[#262626] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm"
            >
              <Printer size={18} /> Cetak Struk
            </button>
            {!showWaInput ? (
              <button
                onClick={() => setShowWaInput(true)}
                className="tap h-12 rounded-xl bg-[#25D366] hover:bg-[#22C55E] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm"
              >
                <MessageCircle size={18} /> Kirim WA
              </button>
            ) : (
              <button
                onClick={handleCopyText}
                className="tap h-12 rounded-xl bg-[#F4F5F7] hover:bg-[#E5E7EB] text-[#374151] font-bold text-sm flex items-center justify-center gap-2 border"
              >
                <Copy size={16} /> Salin Teks
              </button>
            )}
          </div>
          {showNewTransactionBtn ? (
            <button
              onClick={onClose}
              className="tap w-full h-11 rounded-xl bg-[#F4F5F7] hover:bg-[#E5E7EB] font-bold text-sm text-[#111827] flex items-center justify-center gap-2"
            >
              <span>Transaksi Baru</span>
              <span className="text-[10px] text-[#6B7280] font-normal">(Selesai)</span>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="tap w-full h-10 rounded-xl bg-[#F4F5F7] hover:bg-[#E5E7EB] font-bold text-xs text-[#111827] flex items-center justify-center"
            >
              Tutup Pratinjau
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
