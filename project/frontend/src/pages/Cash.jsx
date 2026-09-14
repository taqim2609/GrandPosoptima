import { useEffect, useRef, useState } from "react";
import api, { apiError } from "@/lib/api";
import { rupiah, wibToday } from "@/lib/format";
import { toast } from "sonner";
import { Wallet, ArrowDownCircle, ArrowUpCircle, Plus, ScanLine, Loader2, Utensils, Store, Trash2, Info } from "lucide-react";
import { bizCache, loadBusiness, labelsOf } from "@/lib/business";

const SCOPES = [
  { key: "fnb", label: "F&B", icon: Utensils },
  { key: "retail", label: "Retail", icon: Store },
];

export default function Cash() {
  const [type, setType] = useState("out"); // default keluar (pengeluaran F&B)
  const [scope, setScope] = useState("fnb");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Bahan Baku");
  const [note, setNote] = useState("");
  const [data, setData] = useState(null);
  const [date, setDate] = useState(wibToday());
  const [cats, setCats] = useState(["Bahan Baku", "Belanja Operasional", "Bayar Supplier", "Kasbon", "Lainnya"]);
  const [newCat, setNewCat] = useState("");
  const [edits, setEdits] = useState({}); // scan item edits
  const [scanOpen, setScanOpen] = useState(false);
  const [scanItems, setScanItems] = useState([]);
  const [scanTotal, setScanTotal] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const scanRef = useRef(null);
  const [biz, setBiz] = useState(bizCache());
  useEffect(() => { loadBusiness().then(setBiz); }, []);
  const lb = labelsOf(biz);
  const scLabel = (k) => (k === "retail" ? lb.retail : lb.fnb);

  // Muat data kas: bila server sesaat tidak merespons (502/5xx) tampilkan toast, JANGAN
  // sampai jadi unhandled rejection (overlay). Data lama tetap dipertahankan bila ada.
  const load = () =>
    api.get("/cash", { params: { date } })
      .then((r) => setData(r.data))
      .catch((e) => {
        setData((prev) => prev || null);
        const code = e?.response?.status || e?.code;
        toast.error(code === 502 || (code && code >= 500)
          ? "Server toko sedang sibuk/sebentar tidak merespons — muat ulang sebentar lagi."
          : apiError(e?.response?.data?.detail));
      });
  const loadCats = () => api.get("/cash/categories").then((r) => setCats(r.data.categories || [])).catch(() => {});
  // Status shift hari ini (shift harian bersama per toko) — pengeluaran menempel ke shift
  // toko yang sesuai; `undefined` = belum diketahui (jangan tampilkan banner dulu).
  const [shiftInfo, setShiftInfo] = useState(undefined);
  const loadShift = () => api.get("/shifts/current")
    .then((r) => setShiftInfo(r.data || null))
    .catch(() => setShiftInfo(undefined));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch on date change
  useEffect(() => { load(); loadCats(); loadShift(); }, [date]);

  const addCat = async () => {
    const c = newCat.trim();
    if (!c) return;
    if (cats.includes(c)) return toast.error("Kategori sudah ada");
    const next = [...cats, c];
    setCats(next);
    await api.put("/cash/categories", { categories: next.filter((x) => !["Bahan Baku", "Belanja Operasional", "Bayar Supplier", "Kasbon", "Lainnya"].includes(x)) }).catch(() => {});
    setNewCat("");
    setCategory(c);
    toast.success(`Kategori "${c}" ditambahkan`);
  };

  const submit = async () => {
    if (!amount || Number(amount) <= 0) return toast.error("Nominal harus > 0");
    try {
      await api.post("/cash", { type, amount: Number(amount), category, note, scope });
      toast.success(type === "in" ? "Kas masuk dicatat" : `Pengeluaran ${scLabel(scope)} dicatat`);
      setAmount(""); setNote("");
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const scanReceipt = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setScanning(true); setScanOpen(true); setScanItems([]);
    const t = toast.loading("Membaca struk dengan AI Vision...");
    try {
      const b64 = await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ""));
        fr.onerror = () => resolve("");
        fr.readAsDataURL(f);
      });
      const { data: d } = await api.post("/ai/expense-vision", { image: b64 });
      setScanItems(d.items || []);
      setEdits({});
      setScanTotal(d.total || 0);
      if (!(d.items || []).length) toast.error("Tidak ada item terbaca — coba foto yang lebih jelas", { id: t });
      else toast.success(`${d.items.length} pengeluaran terbaca (Rp${(d.total || 0).toLocaleString("id-ID")})`, { id: t });
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || "Gagal membaca struk", { id: t, duration: 9000 });
      setScanOpen(false);
    } finally { setScanning(false); }
  };

  const saveScan = async () => {
    if (!scanItems.length) return;
    setSaving(true);
    const t = toast.loading("Menyimpan pengeluaran...");
    try {
      const items = scanItems.map((it, i) => {
        const e = edits[i] || {};
        return { type: "out", amount: Number(e.amount ?? it.amount), category: e.category || it.category || "Lainnya", note: e.name ?? it.name, scope };
      });
      const { data: d } = await api.post("/cash/bulk", { items });
      toast.success(`${d.count} pengeluaran disimpan (${scLabel(scope)})`, { id: t });
      setScanOpen(false); setScanItems([]); setScanTotal(0);
      load();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || "Gagal menyimpan", { id: t, duration: 9000 });
    } finally { setSaving(false); }
  };

  const setTypeCat = (t) => {
    setType(t);
    setCategory(t === "in" ? "Modal Awal" : cats[0] || "Lainnya");
  };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-3xl font-extrabold flex items-center gap-2"><Wallet /> Pengeluaran {lb.fnb} &amp; Kas</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input data-testid="cash-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl border px-3 font-num bg-white" />
          <button data-testid="scan-expense-btn" onClick={() => scanRef.current?.click()} disabled={scanning}
            className="tap h-11 px-4 rounded-xl bg-[#4F46E5] text-white font-bold text-sm flex items-center gap-2 disabled:opacity-60">
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />} Scan Struk (Vision)
          </button>
          <input ref={scanRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={scanReceipt} data-testid="scan-expense-input" />
        </div>
      </div>

      {/* Keterangan shift: pengeluaran menempel ke shift TOKO yang sesuai (bila shift terbuka) */}
      {shiftInfo !== undefined && (
        <div data-testid="cash-shift-info"
          className={`mb-6 flex items-start gap-2 rounded-xl border px-4 py-3 text-[12px] ${
            shiftInfo ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E40AF]" : "bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]"}`}>
          <Info size={15} className="shrink-0 mt-0.5" />
          <span>
            {shiftInfo ? (
              <>Shift {scLabel("fnb")} &amp; {scLabel("retail")} hari ini dibuka oleh <b>{shiftInfo.opened_by || "-"}</b>.
                {" "}Pengeluaran {scLabel("fnb")} masuk shift {scLabel("fnb")}, pengeluaran {scLabel("retail")} masuk shift {scLabel("retail")} —
                boleh diisi kapan saja selama shift terbuka, atau nanti saat <b>tutup shift</b>.</>
            ) : (
              <>Shift hari ini <b>belum dibuka</b>. Pengeluaran tetap tercatat pada tanggal ini dan ikut laporan harian,
                tetapi belum masuk laporan shift mana pun — buka shift di halaman <b>Shift</b> bila perlu.</>
            )}
          </span>
        </div>
      )}

      {/* Ringkasan terpisah */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl border-2 border-[#F59E0B] bg-[#FEF3C7] p-5">
          <Utensils size={22} className="text-[#B45309]" />
          <div className="text-xs font-bold uppercase tracking-wider mt-2 text-[#B45309]">Pengeluaran {lb.fnb}</div>
          <div className="font-num text-2xl font-extrabold" data-testid="cash-out-fnb">{rupiah(data?.out_fnb || 0)}</div>
        </div>
        <div className="rounded-2xl border-2 border-[#6366F1] bg-[#E0E7FF] p-5">
          <Store size={22} className="text-[#4338CA]" />
          <div className="text-xs font-bold uppercase tracking-wider mt-2 text-[#4338CA]">Pengeluaran {lb.retail}</div>
          <div className="font-num text-2xl font-extrabold" data-testid="cash-out-retail">{rupiah(data?.out_retail || 0)}</div>
        </div>
        <div className="rounded-2xl border-2 border-[#0A0A0A] bg-[#0A0A0A] text-white p-5">
          <Wallet size={22} className="text-white/80" />
          <div className="text-xs font-bold uppercase tracking-wider mt-2 text-white/70">Total Pengeluaran</div>
          <div className="font-num text-2xl font-extrabold" data-testid="cash-out-total">{rupiah(data?.cash_out || 0)}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border p-5">
          <h3 className="font-extrabold mb-4">Catat Kas / Pengeluaran</h3>
          <div className="flex gap-2 mb-3">
              {SCOPES.map((s) => (
                <button key={s.key} data-testid={`cash-scope-${s.key}`} onClick={() => setScope(s.key)}
                  className={`tap flex-1 h-9 rounded-lg font-bold text-xs flex items-center justify-center gap-1 ${scope === s.key ? "bg-[#0A0A0A] text-white" : "bg-[#F4F5F7]"}`}>
                  <s.icon size={13} /> {scLabel(s.key)}
                </button>
              ))}
          </div>
          <Field label="Nominal"><input data-testid="cash-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full h-11 rounded-xl border px-3 font-num" /></Field>
          <Field label="Kategori" className="mt-3">
            <select data-testid="cash-category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-11 rounded-xl border px-3 bg-white">
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex gap-1.5 mt-1.5">
              <input data-testid="cash-new-cat" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Kategori baru…"
                className="flex-1 h-9 rounded-lg border px-2 text-xs" onKeyDown={(e) => { if (e.key === "Enter") addCat(); }} />
              <button data-testid="add-cash-cat" onClick={addCat} className="tap h-9 px-3 rounded-lg bg-[#0A0A0A] text-white text-xs font-bold">Tambah</button>
            </div>
          </Field>
          <Field label="Catatan" className="mt-3"><input value={note} onChange={(e) => setNote(e.target.value)} className="w-full h-11 rounded-xl border px-3" placeholder="opsional" /></Field>
          <button data-testid="submit-cash" onClick={submit} className="tap w-full h-12 mt-4 rounded-xl bg-[#E63946] text-white font-bold flex items-center justify-center gap-2"><Plus size={18} /> Simpan</button>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between"><h3 className="font-extrabold">Riwayat Kas</h3>
            <span className="text-xs text-[#52525B]">{scLabel(scope) === "Umum" ? "" : ""} {data?.movements?.length || 0} catatan</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
              <tr><th className="text-left p-3">Waktu</th><th className="text-left p-3">Kategori</th><th className="text-left p-3">Scope</th><th className="text-left p-3">Kasir</th><th className="text-right p-3">Nominal</th></tr>
            </thead>
            <tbody>
              {(!data || data.movements.length === 0) && <tr><td colSpan={5} className="p-8 text-center text-[#a1a1aa]">Belum ada transaksi kas</td></tr>}
              {data?.movements.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-3 text-[#52525B]">{new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="p-3">{m.category}{m.note ? ` · ${m.note}` : ""}</td>
                  <td className="p-3"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F4F5F7]">{scLabel(m.scope || "fnb")}</span></td>
                  <td className="p-3">{m.cashier_name}</td>
                  <td className={`p-3 text-right font-num font-bold ${m.type === "in" ? "text-[#047857]" : "text-[#EF4444]"}`}>{m.type === "in" ? "+" : "-"}{rupiah(m.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog hasil scan */}
      {scanOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" data-testid="scan-result-dialog">
            <h3 className="font-extrabold text-lg mb-1 flex items-center gap-2"><ScanLine className="text-[#4F46E5]" /> Hasil Scan Struk (Vision)</h3>
            <p className="text-xs text-[#52525B] mb-3">Pengeluaran akan dicatat sebagai <b>{scLabel(scope)}</b>. Periksa lalu simpan.</p>
            {scanning && <div className="py-8 grid place-items-center"><Loader2 size={28} className="animate-spin text-[#4F46E5]" /></div>}
            {!scanning && scanItems.length === 0 && <div className="py-6 text-center text-[#a1a1aa]">Tidak ada item terbaca.</div>}
            {!scanning && scanItems.map((it, i) => {
              const e = edits[i] || {};
              const name = e.name ?? it.name;
              const amount = e.amount ?? it.amount;
              const category = e.category ?? it.category;
              return (
                <div key={i} className="border-b py-2 text-sm" data-testid={`scan-row-${i}`}>
                  <input data-testid={`scan-name-${i}`} value={name} onChange={(ev) => setEdits((ed) => ({ ...ed, [i]: { ...(ed[i] || {}), name: ev.target.value } }))}
                    className="w-full h-9 rounded-lg border px-2 mb-1" />
                  <div className="flex gap-1.5">
                    <input data-testid={`scan-amount-${i}`} type="number" value={amount} onChange={(ev) => setEdits((ed) => ({ ...ed, [i]: { ...(ed[i] || {}), amount: ev.target.value } }))}
                      className="w-28 h-9 rounded-lg border px-2 font-num text-xs" />
                    <select data-testid={`scan-cat-${i}`} value={category} onChange={(ev) => setEdits((ed) => ({ ...ed, [i]: { ...(ed[i] || {}), category: ev.target.value } }))}
                      className="flex-1 h-9 rounded-lg border px-2 bg-white text-xs">
                      {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button data-testid={`scan-del-${i}`} onClick={() => setScanItems((items) => items.filter((_, x) => x !== i))}
                      className="tap h-9 w-9 rounded-lg bg-[#FEE2E2] text-[#EF4444] grid place-items-center"><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
            {!scanning && scanItems.length > 0 && (
              <div className="flex justify-between font-extrabold text-base mt-2">
                <span>Total</span><span className="font-num text-[#E63946]">{rupiah(scanItems.reduce((a, it, i) => a + Number((edits[i]?.amount ?? it.amount) || 0), 0))}</span>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setScanOpen(false); setScanItems([]); }} className="tap h-11 px-5 rounded-xl bg-[#F4F5F7] font-bold">Batal</button>
              <button data-testid="save-scan-expenses" onClick={saveScan} disabled={saving || !scanItems.length}
                className="tap flex-1 h-11 rounded-xl bg-[#4F46E5] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Simpan {scanItems.length} Pengeluaran
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const Field = ({ label, children, className = "" }) => (
  <div className={className}><label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">{label}</label><div className="mt-1.5">{children}</div></div>
);
