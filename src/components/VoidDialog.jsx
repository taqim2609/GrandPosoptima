/* ================================================================
   DIALOG VOID / REFUND — dipakai halaman Transaksi & POS.
   Menampilkan PRATINJAU dampak dari server (GET /orders/{oid}/void-preview):
     boleh/tidak, alasan blokir, butuh lepas blokir (khusus admin), dan dampaknya
     (stok retail kembali, kupon, poin member, kas, bagi hasil vendor).
   Aturan (docs/RANCANGAN-VOID-PESANAN.md):
     - kasir boleh void sendiri HANYA pada shift yang sedang terbuka;
     - shift yang sudah ditutup DIBLOKIR → hanya admin yang bisa melepas blokir + catatan;
     - alasan wajib (panjang minimal dari pengaturan).
   ================================================================ */
import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { isAdmin } from "@/lib/rbac";
import { rupiah } from "@/lib/format";
import { printReceipt } from "@/lib/receipt";
import { Ban, RotateCcw, Loader2, AlertTriangle, ShieldAlert, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function VoidDialog({ order, open, onOpenChange, onDone }) {
  const { user } = useAuth();
  const admin = isAdmin(user) || !!user?.is_superadmin;
  const [prev, setPrev] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [action, setAction] = useState("void");
  const [force, setForce] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    setReason(""); setForce(false); setNote(""); setPrev(null);
    setAction(order.status === "paid" ? "refund" : "void");
    setLoading(true);
    api.get(`/orders/${order.id}/void-preview`)
      .then((r) => { setPrev(r.data || {}); if (r.data?.impact?.kind_default) setAction(r.data.impact.kind_default); })
      .catch((e) => toast.error(apiError(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, [open, order]);

  const minLen = Math.max(1, Number(prev?.alasan_min || 5));
  const needForce = !!prev?.need_force;
  const canForce = !!prev?.can_force && admin;
  const blocked = prev && !prev.can && !needForce;
  const reasonOk = !prev?.wajib_alasan || reason.trim().length >= minLen;
  const forceOk = !needForce || (force && note.trim().length >= 3);
  const canSubmit = !!prev && prev.can !== undefined && !blocked && reasonOk && forceOk;

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/orders/${order.id}/void`, {
        reason: reason.trim(), action, force_cross_shift: force, force_note: note.trim(),
      });
      const eff = data.effects || {};
      const bits = [];
      if (eff.restock) bits.push(`stok ${eff.restock} produk dikembalikan`);
      if (eff.coupon_reverted) bits.push("pemakaian kupon dikembalikan");
      if (eff.points_reverted) bits.push("poin member disesuaikan");
      toast.success(`${action === "refund" ? "Refund" : "Void"} ${order.order_number} tercatat${bits.length ? " — " + bits.join(", ") : ""}`);
      onOpenChange(false);
      if (onDone) onDone(data);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };

  const impact = prev?.impact || {};
  const doPrint = () => {
    // Bukti pembatalan memakai template struk yang sama dengan penanda besar VOID/REFUND.
    printReceipt({ ...order, void_note: `${action === "refund" ? "REFUND" : "VOID"} — ${reason.trim()}`, voided: true }).catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* max-h + overflow: pratinjau bisa panjang → dialog harus bisa digulir di layar kecil
          (tablet/HP kasir), supaya tombol konfirmasi tetap terjangkau. */}
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban size={18} /> Void / Refund — {order?.order_number}
          </DialogTitle>
        </DialogHeader>

        {loading || !prev ? (
          <div className="py-8 grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>
        ) : (
          <>
            {blocked ? (
              <div data-testid="void-blocked" className="rounded-xl bg-[#FEE2E2] border border-[#FECACA] p-3 text-sm text-[#B91C1C] flex gap-2">
                <ShieldAlert size={18} className="shrink-0" />
                <span><b>Tidak bisa dibatalkan:</b> {prev.block_reason}</span>
              </div>
            ) : needForce ? (
              <div data-testid="void-need-force" className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3 text-sm text-[#92400E] flex gap-2">
                <AlertTriangle size={18} className="shrink-0" />
                <span>{prev.block_reason}</span>
              </div>
            ) : (
              <p className="text-sm text-[#52525B]">
                Transaksi lunas tidak boleh diedit — koreksi hanya lewat void/refund dengan jejak audit.
                Dampak di bawah ini yang akan dijalankan.
              </p>
            )}

            {/* pilihan jenis */}
            <div className="flex gap-2 mt-1">
              <button data-testid="void-kind-void" onClick={() => setAction("void")}
                className={`tap flex-1 h-11 rounded-xl font-bold flex items-center justify-center gap-2 ${action === "void" ? "bg-[#0A0A0A] text-white" : "bg-[#F4F5F7]"}`}>
                <Ban size={15} /> Void (dibatalkan)
              </button>
              <button data-testid="void-kind-refund" onClick={() => setAction("refund")}
                className={`tap flex-1 h-11 rounded-xl font-bold flex items-center justify-center gap-2 ${action === "refund" ? "bg-[#B91C1C] text-white" : "bg-[#F4F5F7]"}`}>
                <RotateCcw size={15} /> Refund (uang kembali)
              </button>
            </div>

            {/* pratinjau dampak */}
            <div className="rounded-xl border bg-[#F9FAFB] p-3 text-sm" data-testid="void-impact">
              <div className="text-[11px] font-bold text-[#52525B] uppercase mb-1">Dampak yang akan terjadi</div>
              <ul className="space-y-0.5 text-[13px]">
                <li>• Nominal <b className="font-num">{rupiah(impact.amount || 0)}</b> keluar dari penjualan &amp; laba
                  {impact.cash_reduction ? <> · kas laci berkurang <b className="font-num">{rupiah(impact.cash_reduction)}</b></> : null}</li>
                {impact.restock_items ? <li>• Stok retail dikembalikan: <b>{impact.restock_items} produk</b> ({impact.restock_qty} unit)</li> : null}
                {impact.coupon ? <li>• Pemakaian kupon <b>{impact.coupon}</b> dikembalikan ({rupiah(impact.coupon_discount)})</li> : null}
                {impact.points_redeem_back ? <li>• Poin ditukar dikembalikan: <b>{impact.points_redeem_back}</b> poin</li> : null}
                {impact.points_earned_revert ? <li>• Poin yang didapat dari transaksi ditarik: <b>{impact.points_earned_revert}</b> poin</li> : null}
                {impact.vendor_share_removed ? <li>• Bagi hasil vendor berkurang <b className="font-num">{rupiah(impact.vendor_share_removed)}</b></li> : null}
                {prev.prev_status === "open" ? <li>• Bill terbuka: meja dilepas, stok/kupon/poin tidak berubah</li> : null}
              </ul>
              {impact.vendor_settled_warning && (
                <div className="mt-2 text-[12px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-2 py-1.5">
                  Perhatian: bagi hasil vendor untuk transaksi ini (atau vendor terkait) <b>sudah pernah dibayar</b> lewat
                  Settlement ({rupiah(impact.vendor_settled_total)}) — saldo vendor bisa menjadi minus di periode berikutnya.
                </div>
              )}
            </div>

            {/* pelepasan blokir khusus admin */}
            {needForce && (
              canForce ? (
                <label data-testid="void-force-box" className="flex items-start gap-2 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3 text-sm">
                  <input data-testid="void-force" type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-1" />
                  <span>
                    <b>Lepas blokir (koreksi lintas shift)</b> — saya sadar transaksi ini terjadi pada shift yang sudah
                    ditutup, dan pembatalan ini akan tercatat sebagai koreksi lintas shift.
                  </span>
                </label>
              ) : (
                <div className="rounded-xl bg-[#FEE2E2] border border-[#FECACA] p-3 text-sm text-[#B91C1C]">
                  Hanya <b>admin</b> yang boleh melepas blokir koreksi lintas shift. Minta admin membatalkan transaksi ini.
                </div>
              )
            )}
            {needForce && canForce && force && (
              <div>
                <label className="text-[11px] font-bold text-[#52525B] uppercase">Catatan pelepasan blokir (wajib)</label>
                <input data-testid="void-force-note" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="mis. sudah dicek owner, salah input kemarin" className="mt-1 w-full h-11 rounded-xl border px-3" />
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-[#52525B] uppercase">
                Alasan {prev.wajib_alasan ? `(wajib, min ${minLen} huruf)` : "(opsional)"}
              </label>
              <textarea data-testid="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                placeholder="mis. pelanggan batal, salah input produk, salah meja"
                className="mt-1 w-full rounded-xl border px-3 py-2 resize-none" />
              {!reasonOk && <div className="text-[11px] text-[#B45309] mt-1">Alasan minimal {minLen} huruf.</div>}
            </div>
          </>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <button data-testid="confirm-void-btn" onClick={submit} disabled={busy || !canSubmit}
            className="tap w-full h-12 rounded-xl bg-[#EF4444] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={17} className="animate-spin" /> : action === "refund" ? <RotateCcw size={17} /> : <Ban size={17} />}
            Konfirmasi {action === "refund" ? "Refund" : "Void"}
          </button>
          {prev && prev.can && (
            <button data-testid="void-print-btn" onClick={doPrint} className="tap w-full h-10 rounded-xl bg-white border font-bold text-sm flex items-center justify-center gap-2">
              <Printer size={15} /> Cetak bukti {action === "refund" ? "refund" : "void"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
