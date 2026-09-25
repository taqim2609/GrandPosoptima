import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckCircle2, Copy, Check, Printer, MessageCircle, Send, Loader2, X } from "lucide-react";
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
  outlet = null,
  cfg = null,
}) {
  const [waPhone, setWaPhone] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [showWaInput, setShowWaInput] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (order) {
      setWaPhone(order.customer_phone || "");
      setShowWaInput(false);
      setCopied(false);
    }
  }, [order]);

  if (!order && !open) return null;

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
      <DialogContent className="max-w-md max-h-[92vh] overflow-hidden flex flex-col p-0 bg-[#F4F5F7] border border-[#E4E4E7] shadow-2xl">
        {/* Header Title */}
        <div className="p-4 pb-3 bg-white border-b flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#ECFDF5] text-[#059669] grid place-items-center font-bold">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-base text-[#111827] leading-tight">{title}</h2>
              <p className="text-xs text-[#6B7280]">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
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

        {/* Scrollable Receipt Paper Preview Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex justify-center bg-[#F4F5F7]">
          {order && (
            <ReceiptPaper
              order={order}
              outlet={outlet}
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
