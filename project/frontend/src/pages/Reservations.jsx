import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { rupiah, wibToday } from "@/lib/format";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { can, isAdmin, isSuperAdmin } from "@/lib/rbac";
import {
  CalendarCheck, Plus, Users, Phone, Trash2, Clock, Bot, Info, Copy, Check,
  Hash, MessageSquare, Play, Sparkles, AlertCircle, ShieldCheck, ShieldAlert,
  ArrowRight, RefreshCw, CheckCircle2, XCircle, Tag, Settings, Send, Lock
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const STATUS_LABEL = {
  pending: "Menunggu",
  confirmed: "Dikonfirmasi",
  arrived: "Datang",
  cancelled: "Batal",
  done: "Selesai",
};

const STATUS_COLOR = {
  pending: "bg-[#FEF3C7] text-[#B45309]",
  confirmed: "bg-[#E0E7FF] text-[#4338CA]",
  arrived: "bg-[#D1FAE5] text-[#047857]",
  cancelled: "bg-[#FEE2E2] text-[#EF4444]",
  done: "bg-[#F4F5F7] text-[#52525B]",
};

export default function Reservations() {
  const { user } = useAuth();
  const canManageWa = Boolean(
    isSuperAdmin(user) ||
    isAdmin(user) ||
    can(user, "whatsapp") ||
    can(user, "pengaturan")
  );

  const [date, setDate] = useState(wibToday());
  const [rows, setRows] = useState([]);
  const [tables, setTables] = useState([]);
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("rules"); // "rules" | "format" | "simulator"
  const [copied, setCopied] = useState(false);
  const [formatCopied, setFormatCopied] = useState(false);
  const [form, setForm] = useState({
    table_id: "",
    customer_name: "",
    phone: "",
    pax: 2,
    time: "12:00",
    note: "",
  });

  // Group reservation rules & keyword state
  const [groupConfig, setGroupConfig] = useState({
    group_only_reservation: true,
    reservation_keywords: "#reservasi, #booking, !reservasi, reservasi",
    target_group_id: "",
    reply_to_group: true,
    send_private_confirm: true,
    reject_private_booking: true,
  });
  const [keywords, setKeywords] = useState(["#reservasi", "#booking", "!reservasi", "reservasi"]);
  const [newKeywordInput, setNewKeywordInput] = useState("");
  const [savingRules, setSavingRules] = useState(false);

  // Simulator state
  const [simText, setSimText] = useState(
    "#reservasi\nNama: Teuku Umar\nJumlah: 4 orang\nTanggal: besok\nJam: 19:30\nMeja: Meja 2\nCatatan: Dekat AC / Tidak Merokok"
  );
  const [simIsGroup, setSimIsGroup] = useState(true);
  const [simSender, setSimSender] = useState("6281234567890");
  const [simGroupId, setSimGroupId] = useState("120363024823904123@g.us");
  const [simSenderName, setSimSenderName] = useState("Teuku Umar");
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState(null);

  const webhookUrl = `${window.location.origin}/api/webhook/whatsapp`;

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("URL Webhook berhasil disalin!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenRules = () => {
    if (!canManageWa) {
      toast.error("Akses Ditolak: Hanya pengguna dengan izin WhatsApp / Admin yang dapat mengatur aturan reservasi grup.");
      return;
    }
    setRulesOpen(true);
  };

  const handleOpenInfo = () => {
    if (!canManageWa) {
      toast.error("Akses Ditolak: Hanya pengguna dengan izin WhatsApp / Admin yang dapat melihat dan mengatur Webhook WhatsApp.");
      return;
    }
    setInfoOpen(true);
  };

  const copyTemplateFormat = () => {
    const textFormat =
      `#reservasi\n` +
      `Nama: [Nama Anda]\n` +
      `Jumlah: [Jumlah Orang, cth: 4]\n` +
      `Tanggal: [YYYY-MM-DD / Hari ini / Besok]\n` +
      `Jam: [HH:MM WIB, cth: 19:30]\n` +
      `Meja: [Opsional, cth: Meja 3 / VIP]\n` +
      `Catatan: [Permintaan khusus jika ada]`;
    navigator.clipboard.writeText(textFormat);
    setFormatCopied(true);
    toast.success("Format pesan reservasi berhasil disalin!");
    setTimeout(() => setFormatCopied(false), 2000);
  };

  const load = () => {
    api
      .get("/reservations", { params: { date } })
      .then((r) => setRows(r.data.reservations || []))
      .catch(() => {});
    api
      .get("/tables")
      .then((r) => setTables(r.data || []))
      .catch(() => {});
  };

  const loadRules = () => {
    api
      .get("/whatsapp/reservation-settings")
      .then((r) => {
        const c = r.data || {};
        setGroupConfig(c);
        const kw = (c.reservation_keywords || "#reservasi, #booking, !reservasi, reservasi")
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
        setKeywords(kw);
      })
      .catch(() => {});
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch on date change
  useEffect(() => {
    load();
    loadRules();
  }, [date]);

  const addKeyword = () => {
    if (!canManageWa) {
      toast.error("Akses Ditolak: Anda tidak memiliki izin untuk mengubah kata kunci");
      return;
    }
    const clean = newKeywordInput.trim().toLowerCase();
    if (!clean) return;
    if (keywords.includes(clean)) {
      toast.error("Kata kunci sudah terdaftar");
      return;
    }
    const updated = [...keywords, clean];
    setKeywords(updated);
    setGroupConfig((prev) => ({ ...prev, reservation_keywords: updated.join(", ") }));
    setNewKeywordInput("");
  };

  const removeKeyword = (kwToRemove) => {
    if (!canManageWa) {
      toast.error("Akses Ditolak: Anda tidak memiliki izin untuk menghapus kata kunci");
      return;
    }
    if (keywords.length <= 1) {
      toast.error("Minimal harus ada 1 kata kunci reservasi aktif");
      return;
    }
    const updated = keywords.filter((k) => k !== kwToRemove);
    setKeywords(updated);
    setGroupConfig((prev) => ({ ...prev, reservation_keywords: updated.join(", ") }));
  };

  const saveRules = async () => {
    if (!canManageWa) {
      toast.error("Akses Ditolak: Anda tidak memiliki izin untuk menyimpan aturan ini");
      return;
    }
    setSavingRules(true);
    try {
      const payload = {
        ...groupConfig,
        reservation_keywords: keywords.join(", "),
      };
      await api.post("/whatsapp/reservation-settings", payload);
      toast.success("Pengaturan reservasi grup & kata kunci berhasil disimpan!");
      setGroupConfig(payload);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSavingRules(false);
    }
  };

  const runSimulation = async () => {
    if (!simText.trim()) return toast.error("Teks pesan simulasi tidak boleh kosong");
    setSimLoading(true);
    try {
      const r = await api.post("/whatsapp/simulate-reservation", {
        text: simText,
        is_group: simIsGroup,
        sender_phone: simSender,
        group_id: simGroupId,
        sender_name: simSenderName,
      });
      setSimResult(r.data);
      if (r.data.status === "approved") {
        toast.success("Simulasi Berhasil: Pesan lolos aturan & reservasi terbentuk!");
      } else {
        toast.warning(`Simulasi Ditolak: ${r.data.rejection_reason}`);
      }
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSimLoading(false);
    }
  };

  const applySimToReal = async () => {
    if (!canManageWa) {
      return toast.error("Akses Ditolak: Anda tidak memiliki izin untuk menyimpan reservasi simulasi ke jadwal riil");
    }
    if (!simResult || simResult.status !== "approved" || !simResult.parsed) {
      return toast.error("Hanya simulasi yang lolos yang dapat disimpan ke jadwal");
    }
    try {
      const parsed = simResult.parsed;
      const tMatch = simResult.matched_table;
      await api.post("/reservations", {
        customer_name: parsed.customer_name || "Pelanggan Simulasi",
        phone: simSender,
        table_id: tMatch?.id || (tables[0] ? tables[0].id : ""),
        table_name: tMatch?.name || parsed.table_name || "Meja",
        date: parsed.date || date,
        time: parsed.time || "19:00",
        pax: parsed.pax || 2,
        note: `${parsed.note ? parsed.note + ' — ' : ''}Grup WA [${simResult.matched_keyword}]`,
      });
      toast.success("Reservasi hasil simulasi berhasil disimpan ke jadwal POS!");
      load();
      setRulesOpen(false);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const save = async () => {
    if (!form.customer_name.trim()) return toast.error("Nama pemesan wajib");
    if (!form.table_id) return toast.error("Pilih meja");
    try {
      await api.post("/reservations", { ...form, date });
      toast.success("Reservasi dibuat (Dikonfirmasi)");
      setOpen(false);
      setForm({ table_id: "", customer_name: "", phone: "", pax: 2, time: "12:00", note: "" });
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const setStatus = async (id, status) => {
    try {
      await api.post(`/reservations/${id}/status`, { status });
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const del = async (id) => {
    if (!window.confirm("Hapus reservasi ini?")) return;
    try {
      await api.delete(`/reservations/${id}`);
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-2">
            <CalendarCheck /> Reservasi Meja
          </h1>
          <p className="text-xs text-[#52525B] mt-1">
            Kelola daftar reservasi pelanggan dan sistem booking otomatis WhatsApp khusus grup & kata kunci
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleOpenRules}
            data-testid="group-rules-btn"
            title={canManageWa ? "Kelola Aturan Grup & Kata Kunci" : "Khusus staf berizin (Admin / WhatsApp)"}
            className={`tap h-11 px-4 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all ${
              canManageWa
                ? "bg-[#0284C7] hover:bg-[#0369A1] text-white"
                : "bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#64748B] border border-[#CBD5E1]"
            }`}
          >
            {canManageWa ? <Hash size={16} /> : <Lock size={15} className="text-[#94A3B8]" />}
            Aturan Grup & Kata Kunci
            {!canManageWa && (
              <span className="text-[10px] bg-[#E2E8F0] text-[#475569] px-1.5 py-0.5 rounded font-semibold">
                Terkunci
              </span>
            )}
          </button>
          <button
            onClick={handleOpenInfo}
            title={canManageWa ? "Panduan & Webhook WhatsApp" : "Khusus staf berizin (Admin / WhatsApp)"}
            className={`tap h-11 px-4 rounded-xl font-bold text-xs flex items-center gap-2 border transition-all ${
              canManageWa
                ? "bg-[#EEF2FF] hover:bg-[#E0E7FF] text-[#4338CA] border-[#C7D2FE]"
                : "bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]"
            }`}
          >
            {canManageWa ? <Bot size={16} /> : <Lock size={15} className="text-[#94A3B8]" />}
            Webhook WA
            {!canManageWa && (
              <span className="text-[10px] bg-[#E2E8F0] text-[#475569] px-1.5 py-0.5 rounded font-semibold">
                Terkunci
              </span>
            )}
          </button>
          <input
            data-testid="res-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 rounded-xl border px-3 font-num bg-white"
          />
          <button
            data-testid="add-reservation-btn"
            onClick={() => setOpen(true)}
            className="tap h-11 px-5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center gap-2 shadow-sm"
          >
            <Plus size={18} /> Reservasi
          </button>
        </div>
      </div>

      {/* Banner AI Webhook dengan Status Aturan Grup */}
      <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-[#F0FDF4] via-[#ECFDF5] to-[#EFF6FF] border border-[#A7F3D0] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-[#10B981] text-white grid place-items-center shadow-sm">
            <Bot size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-[#065F46]">
                Sistem Reservasi WhatsApp AI — Khusus Grup & Kata Kunci
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#D1FAE5] text-[#047857] border border-[#6EE7B7]">
                {groupConfig.group_only_reservation ? "Mode Khusus Grup Aktif" : "Grup & Personal Aktif"}
              </span>
              {!canManageWa && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] flex items-center gap-1">
                  <Lock size={11} /> Khusus Pengelola Berizin
                </span>
              )}
            </div>
            <p className="text-xs text-[#047857] mt-0.5">
              Hanya pesan yang dikirimkan di dalam <b>Grup WhatsApp resmi</b> dengan kata kunci (seperti{" "}
              <code className="bg-[#DCFCE7] px-1 rounded text-[#166534] font-bold">#reservasi</code>) yang akan diproses
              otomatis oleh sistem POS. Chat pribadi (japri) diarahkan ke grup.
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-[#047857]">
              <span className="font-semibold">Kata Kunci Aktif:</span>
              {keywords.map((k) => (
                <span
                  key={k}
                  className="px-2 py-0.5 rounded-md bg-[#DCFCE7] border border-[#86EFAC] font-mono text-[10px] font-bold text-[#14532D]"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManageWa ? (
            <>
              <button
                onClick={() => setRulesOpen(true)}
                className="tap h-9 px-3 rounded-xl bg-white border border-[#A7F3D0] text-[#065F46] hover:bg-[#F0FDF4] text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Settings size={14} /> Kelola Aturan & Simulasi
              </button>
              <button
                onClick={() => setInfoOpen(true)}
                className="text-xs font-bold text-[#047857] underline hover:text-[#065F46] flex items-center gap-1"
              >
                <Info size={14} /> Panduan URL
              </button>
            </>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-white/80 border border-[#A7F3D0] text-[#065F46] text-xs font-semibold flex items-center gap-1.5 shadow-sm">
              <Lock size={13} className="text-[#059669]" />
              <span>Pengaturan Khusus Staf Berizin</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabel Reservasi */}
      <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left p-3">Jam</th>
              <th className="text-left p-3">Pelanggan</th>
              <th className="text-left p-3">Meja</th>
              <th className="text-center p-3">Pax</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-[#a1a1aa]">
                  Belum ada reservasi untuk tanggal ini.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const isGroupWa =
                r.source === "grup_wa" || (r.note && r.note.includes("Grup WA")) || r.created_by === "Grup WA AI";
              const isAuto =
                isGroupWa ||
                (r.note && (r.note.includes("WhatsApp") || r.note.includes("Booking Otomatis"))) ||
                r.created_by === "WACloud AI" ||
                r.created_by === "Evolution AI";

              return (
                <tr key={r.id} className="border-t hover:bg-[#FAFAFA] transition" data-testid={`reservation-${r.id}`}>
                  <td className="p-3">
                    <span className="font-bold flex items-center gap-1 font-mono text-xs">
                      <Clock size={13} className="text-[#71717A]" /> {r.time}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="font-bold flex items-center gap-1.5 flex-wrap">
                      <span>{r.customer_name || r.name}</span>
                      {isGroupWa ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD] flex items-center gap-1">
                          <Hash size={10} /> Grup WA
                        </span>
                      ) : isAuto ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]">
                          Auto WA
                        </span>
                      ) : null}
                    </div>
                    {r.phone && (
                      <div className="text-[11px] text-[#52525B] flex items-center gap-1 font-mono mt-0.5">
                        <Phone size={10} className="text-[#94A3B8]" /> {r.phone}
                      </div>
                    )}
                    {r.note && <div className="text-[11px] text-[#64748B] mt-0.5">{r.note}</div>}
                  </td>
                  <td className="p-3 font-semibold text-[#18181B]">{r.table_name || `Meja ${r.table_id || "-"}`}</td>
                  <td className="p-3 text-center">
                    <span className="inline-flex items-center gap-1 font-bold text-xs bg-[#F1F5F9] px-2 py-1 rounded-md">
                      <Users size={12} className="text-[#64748B]" /> {r.pax}
                    </span>
                  </td>
                  <td className="p-3">
                    <select
                      value={r.status}
                      onChange={(e) => setStatus(r.id, e.target.value)}
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border-0 cursor-pointer outline-none ${
                        STATUS_COLOR[r.status] || STATUS_COLOR.pending
                      }`}
                    >
                      {Object.entries(STATUS_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => del(r.id)}
                      className="tap h-8 w-8 rounded-lg bg-[#FEE2E2] hover:bg-[#FECACA] text-[#EF4444] grid place-items-center"
                      title="Hapus Reservasi"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Dialog Aturan Grup & Kata Kunci */}
      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Hash className="text-[#0284C7]" /> Aturan Reservasi Grup & Kata Kunci WhatsApp
            </DialogTitle>
          </DialogHeader>

          {/* Navigation Tabs Inside Modal */}
          <div className="flex border-b border-[#E4E4E7] gap-4 mb-4">
            <button
              onClick={() => setActiveTab("rules")}
              className={`pb-2 text-xs font-bold border-b-2 transition ${
                activeTab === "rules"
                  ? "border-[#0284C7] text-[#0284C7]"
                  : "border-transparent text-[#71717A] hover:text-[#18181B]"
              }`}
            >
              1. Aturan & Filter Kata Kunci
            </button>
            <button
              onClick={() => setActiveTab("format")}
              className={`pb-2 text-xs font-bold border-b-2 transition ${
                activeTab === "format"
                  ? "border-[#0284C7] text-[#0284C7]"
                  : "border-transparent text-[#71717A] hover:text-[#18181B]"
              }`}
            >
              2. Format Pesan Pelanggan
            </button>
            <button
              onClick={() => setActiveTab("simulator")}
              className={`pb-2 text-xs font-bold border-b-2 transition flex items-center gap-1 ${
                activeTab === "simulator"
                  ? "border-[#0284C7] text-[#0284C7]"
                  : "border-transparent text-[#71717A] hover:text-[#18181B]"
              }`}
            >
              <Play size={12} /> 3. Simulator Uji Coba Pesan
            </button>
          </div>

          {/* TAB 1: RULES & KEYWORDS */}
          {activeTab === "rules" && (
            <div className="space-y-4 text-xs">
              {/* Toggle Khusus Grup */}
              <div className="p-4 rounded-xl border bg-[#F8FAFC] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-[#0F172A] flex items-center gap-1.5">
                      <ShieldCheck className="text-[#0284C7]" size={16} /> Hanya Terima Reservasi dari Grup WhatsApp
                    </div>
                    <p className="text-[#64748B] text-xs mt-0.5">
                      Pesan reservasi dari chat personal (japri) akan ditolak dan diminta mengirim pesan ke dalam grup resmi restoran.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={groupConfig.group_only_reservation}
                      onChange={(e) =>
                        setGroupConfig({ ...groupConfig, group_only_reservation: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#CBD5E1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0284C7]"></div>
                  </label>
                </div>
              </div>

              {/* Keywords Manager */}
              <div className="p-4 rounded-xl border bg-white space-y-3">
                <div>
                  <div className="font-bold text-sm text-[#0F172A] flex items-center gap-1.5">
                    <Tag className="text-[#0284C7]" size={16} /> Kata Kunci Reservasi (Trigger Otomatis)
                  </div>
                  <p className="text-[#64748B] text-xs mt-0.5">
                    Pesan grup hanya diproses bila diawali atau mengandung salah satu kata kunci di bawah ini:
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {keywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#F0FDF4] border border-[#86EFAC] text-[#166534] font-mono text-xs font-bold"
                    >
                      <Hash size={12} /> {kw}
                      <button
                        onClick={() => removeKeyword(kw)}
                        className="ml-1 text-[#15803D] hover:text-[#DC2626] font-bold"
                        title="Hapus kata kunci"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <input
                    value={newKeywordInput}
                    onChange={(e) => setNewKeywordInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                    placeholder="Tambah kata kunci baru (cth: #pesantempat)"
                    className="flex-1 h-10 rounded-xl border px-3 text-xs outline-none focus:border-[#0284C7]"
                  />
                  <button
                    onClick={addKeyword}
                    className="tap h-10 px-4 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-xs"
                  >
                    Tambah
                  </button>
                </div>
              </div>

              {/* Whitelist Target Group ID */}
              <div className="p-4 rounded-xl border bg-[#F8FAFC] space-y-2">
                <label className="font-bold text-xs text-[#0F172A] block">
                  Whitelist ID Grup WhatsApp Spesifik (Opsional)
                </label>
                <input
                  value={groupConfig.target_group_id || ""}
                  onChange={(e) => setGroupConfig({ ...groupConfig, target_group_id: e.target.value })}
                  placeholder="Contoh: 120363024823904123@g.us (Kosongkan jika semua grup diizinkan)"
                  className="w-full h-10 rounded-xl border bg-white px-3 font-mono text-xs text-[#18181B]"
                />
                <p className="text-[11px] text-[#64748B]">
                  Jika diisi, bot hanya akan memproses reservasi dari grup dengan ID ini saja. ID grup biasanya berakhiran <code className="bg-[#E2E8F0] px-1 rounded">@g.us</code>.
                </p>
              </div>

              {/* Response Behavior Toggles */}
              <div className="p-4 rounded-xl border bg-white space-y-3">
                <div className="font-bold text-xs text-[#0F172A]">Perilaku Respon Bot:</div>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groupConfig.reply_to_group}
                    onChange={(e) => setGroupConfig({ ...groupConfig, reply_to_group: e.target.checked })}
                    className="h-4 w-4 rounded text-[#0284C7]"
                  />
                  <span className="text-xs text-[#334155]">
                    <b>Kirim Balasan Konfirmasi di Dalam Grup:</b> Menyebut (mention) pemesan dan konfirmasi meja/waktu di grup WA.
                  </span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groupConfig.send_private_confirm}
                    onChange={(e) =>
                      setGroupConfig({ ...groupConfig, send_private_confirm: e.target.checked })
                    }
                    className="h-4 w-4 rounded text-[#0284C7]"
                  />
                  <span className="text-xs text-[#334155]">
                    <b>Kirim Tiket / Bukti Reservasi ke Japri Pemesan:</b> Mengirimkan kartu reservasi ke nomor WhatsApp pemesan secara privat.
                  </span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groupConfig.reject_private_booking}
                    onChange={(e) =>
                      setGroupConfig({ ...groupConfig, reject_private_booking: e.target.checked })
                    }
                    className="h-4 w-4 rounded text-[#0284C7]"
                  />
                  <span className="text-xs text-[#334155]">
                    <b>Kirim Pesan Penolakan Ramah jika Chat via Japri:</b> Menginfokan ke pemesan bahwa reservasi hanya dilayani di dalam grup.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: FORMAT TEMPLATE FOR CUSTOMERS */}
          {activeTab === "format" && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E40AF]">
                <div className="font-bold text-sm mb-1">Format Pesan Reservasi Grup</div>
                <p>
                  Bagikan format ini kepada anggota grup WhatsApp Anda atau sematkan (pin) di deskripsi grup WhatsApp restoran. Pelanggan cukup mengisi format ini di dalam grup.
                </p>
              </div>

              <div className="relative p-4 rounded-xl bg-[#1E293B] text-[#F8FAFC] font-mono text-xs leading-relaxed space-y-1">
                <div className="text-[#38BDF8] font-bold">#reservasi</div>
                <div>Nama: Budi Santoso</div>
                <div>Jumlah: 4 orang</div>
                <div>Tanggal: 2026-09-25</div>
                <div>Jam: 19:30</div>
                <div>Meja: Meja 3</div>
                <div>Catatan: Dekat jendela / AC</div>

                <div className="pt-3 flex justify-end">
                  <button
                    onClick={copyTemplateFormat}
                    className="tap px-3 py-1.5 rounded-lg bg-[#334155] hover:bg-[#475569] text-white font-bold text-xs flex items-center gap-1.5"
                  >
                    {formatCopied ? <Check size={14} /> : <Copy size={14} />}{" "}
                    {formatCopied ? "Tersalin" : "Salin Format"}
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-[#F8FAFC] space-y-2">
                <div className="font-bold text-xs text-[#0F172A]">Kecerdasan AI & Fleksibilitas Format:</div>
                <p className="text-[#64748B] text-xs">
                  Sistem juga dapat mengenali variasi bahasa alami seperti:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[#334155]">
                  <li><i>"#reservasi buat 5 orang besok jam 7 malam atas nama Pak Zulkifli"</i></li>
                  <li><i>"#booking meja vip 8 orang tgl 2026-09-28 jam 12:00 siang"</i></li>
                </ul>
                <p className="text-[#64748B] text-xs">
                  Selama pesan mengandung salah satu kata kunci aktif ({keywords.join(", ")}), AI akan otomatis mengekstrak entitas reservasi.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: SIMULATOR & TEST */}
          {activeTab === "simulator" && (
            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] flex items-center justify-between">
                <div>
                  <div className="font-bold">Uji Coba Langsung Sistem Filter Reservasi</div>
                  <div className="text-[11px] text-[#15803D]">
                    Uji apakah pesan Anda lolos validasi grup, terdeteksi kata kuncinya, dan bagaimana balasan bot.
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSimText("#reservasi\nNama: Cut Meutia\nJumlah: 6 orang\nTanggal: hari ini\nJam: 18:30\nMeja: Meja VIP");
                    setSimIsGroup(true);
                  }}
                  className="tap px-2.5 py-1 rounded bg-white text-[#15803D] font-bold border border-[#86EFAC] text-[11px]"
                >
                  Muat Contoh
                </button>
              </div>

              <div className="space-y-2">
                <label className="font-bold text-[#0F172A] block">Teks Pesan WhatsApp yang Dikirimkan:</label>
                <textarea
                  rows={4}
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  placeholder="Ketik pesan simulasi..."
                  className="w-full p-3 rounded-xl border font-mono text-xs outline-none focus:border-[#0284C7] bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#0F172A] block">Asal Pesan:</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSimIsGroup(true)}
                      className={`flex-1 h-9 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition ${
                        simIsGroup
                          ? "bg-[#0284C7] text-white border-[#0284C7]"
                          : "bg-white text-[#64748B] border-[#CBD5E1]"
                      }`}
                    >
                      <Hash size={14} /> Dari Grup WA
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimIsGroup(false)}
                      className={`flex-1 h-9 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition ${
                        !simIsGroup
                          ? "bg-[#DC2626] text-white border-[#DC2626]"
                          : "bg-white text-[#64748B] border-[#CBD5E1]"
                      }`}
                    >
                      <MessageSquare size={14} /> Chat Personal (Japri)
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#0F172A] block">Nama Pemesan (PushName):</label>
                  <input
                    value={simSenderName}
                    onChange={(e) => setSimSenderName(e.target.value)}
                    className="w-full h-9 rounded-xl border bg-white px-3 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={runSimulation}
                  disabled={simLoading}
                  className="tap h-10 px-5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-xs flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {simLoading ? <RefreshCw className="animate-spin" size={14} /> : <Play size={14} />}
                  Jalankan Simulasi Pesan
                </button>
              </div>

              {/* SIMULATION RESULT DISPLAY */}
              {simResult && (
                <div
                  className={`p-4 rounded-xl border space-y-3 transition ${
                    simResult.status === "approved"
                      ? "bg-[#F0FDF4] border-[#86EFAC]"
                      : "bg-[#FEF2F2] border-[#FECACA]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {simResult.status === "approved" ? (
                        <CheckCircle2 className="text-[#16A34A]" size={18} />
                      ) : (
                        <XCircle className="text-[#DC2626]" size={18} />
                      )}
                      <span className="font-extrabold text-sm uppercase">
                        {simResult.status === "approved"
                          ? "Reservasi Diterima & Lolos Aturan"
                          : "Pesan Reservasi Ditolak"}
                      </span>
                    </div>
                    {simResult.matched_keyword && (
                      <span className="px-2 py-0.5 rounded bg-white border font-mono text-[11px] font-bold text-[#0F172A]">
                        Kata Kunci: {simResult.matched_keyword}
                      </span>
                    )}
                  </div>

                  {simResult.status === "rejected" ? (
                    <div className="space-y-2 text-xs text-[#991B1B]">
                      <div className="font-bold">Alasan Penolakan:</div>
                      <p className="bg-white p-2.5 rounded-lg border border-[#FCA5A5]">
                        {simResult.rejection_reason}
                      </p>
                      {simResult.rejection_message && (
                        <div>
                          <div className="font-bold text-[11px] text-[#7F1D1D] mb-1">
                            Pesan Edukasi yang Dikirimkan ke Pengirim:
                          </div>
                          <pre className="bg-[#FFF1F2] p-2.5 rounded-lg border border-[#FECDD3] whitespace-pre-wrap font-sans text-xs">
                            {simResult.rejection_message}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Entitas Ter-ekstrak */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3 rounded-lg border">
                        <div>
                          <div className="text-[10px] text-[#64748B] font-bold">PEMESAN</div>
                          <div className="font-extrabold text-xs">{simResult.parsed?.customer_name}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#64748B] font-bold">KAPASITAS / PAX</div>
                          <div className="font-extrabold text-xs">{simResult.parsed?.pax} Orang</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#64748B] font-bold">WAKTU & TANGGAL</div>
                          <div className="font-extrabold text-xs">
                            {simResult.parsed?.time} WIB ({simResult.parsed?.date})
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#64748B] font-bold">ALOKASI MEJA</div>
                          <div className="font-extrabold text-xs text-[#0284C7]">
                            {simResult.matched_table?.name || simResult.parsed?.table_name || "Auto"}
                          </div>
                        </div>
                      </div>

                      {/* Mock Balasan Grup */}
                      {simResult.mock_group_reply && (
                        <div>
                          <div className="font-bold text-[11px] text-[#065F46] mb-1 flex items-center gap-1">
                            <Hash size={12} /> Tinjauan Balasan Bot ke Grup WhatsApp:
                          </div>
                          <pre className="bg-white p-3 rounded-lg border border-[#BBF7D0] whitespace-pre-wrap font-sans text-xs text-[#065F46] shadow-sm">
                            {simResult.mock_group_reply}
                          </pre>
                        </div>
                      )}

                      {/* Mock Tiket Japri */}
                      {simResult.mock_private_ticket && (
                        <div>
                          <div className="font-bold text-[11px] text-[#1E40AF] mb-1 flex items-center gap-1">
                            <Send size={12} /> Tinjauan Tiket Reservasi ke Japri Pemesan:
                          </div>
                          <pre className="bg-[#EFF6FF] p-3 rounded-lg border border-[#BFDBFE] whitespace-pre-wrap font-sans text-xs text-[#1E3A8A]">
                            {simResult.mock_private_ticket}
                          </pre>
                        </div>
                      )}

                      <div className="flex justify-end pt-1">
                        <button
                          onClick={applySimToReal}
                          className="tap h-9 px-4 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                        >
                          <Plus size={14} /> Simpan Sebagai Reservasi Riil di POS
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full border-t pt-3">
            <span className="text-[11px] text-[#64748B]">
              Perubahan aturan akan otomatis berlaku untuk semua webhook WhatsApp yang masuk.
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setRulesOpen(false)}
                className="tap h-10 px-4 rounded-xl bg-[#F4F5F7] text-[#18181B] font-bold text-xs"
              >
                Tutup
              </button>
              {activeTab === "rules" && canManageWa && (
                <button
                  onClick={saveRules}
                  disabled={savingRules}
                  className="tap h-10 px-5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {savingRules ? <RefreshCw className="animate-spin" size={14} /> : <Check size={14} />}
                  Simpan Aturan
                </button>
              )}
              {activeTab === "rules" && !canManageWa && (
                <div className="h-10 px-4 rounded-xl bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-semibold flex items-center gap-1.5">
                  <Lock size={13} /> Khusus Pengelola Berizin
                </div>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Dialog Info Webhook */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Bot className="text-[#10B981]" /> Konfigurasi Webhook WACloud / Evolution API
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-xs text-[#3F3F46]">
            <p>
              Salin URL Webhook di bawah ini dan pasang pada pengaturan Webhook di provider WhatsApp Anda (Evolution API atau WACloud.id):
            </p>
            <div>
              <label className="text-[11px] font-bold uppercase text-[#71717A] tracking-wider block mb-1">
                URL Webhook Receiver
              </label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={webhookUrl}
                  className="flex-1 h-10 rounded-xl border bg-[#F4F5F7] px-3 font-mono text-xs text-[#18181B]"
                />
                <button
                  onClick={copyUrl}
                  className="tap h-10 px-3 rounded-xl bg-[#18181B] text-white font-bold flex items-center gap-1.5"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Tersalin" : "Salin"}
                </button>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#F4F5F7] border space-y-1.5">
              <div className="font-bold text-[#18181B]">Ketentuan Reservasi Aktif:</div>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <b>Hanya Melalui Grup WhatsApp:</b> Pesan japri otomatis ditolak atau diarahkan ke grup.
                </li>
                <li>
                  <b>Menggunakan Kata Kunci:</b> Pesan harus mengandung salah satu kata kunci (cth:{" "}
                  <code className="bg-[#E2E8F0] px-1 rounded">#reservasi</code>,{" "}
                  <code className="bg-[#E2E8F0] px-1 rounded">#booking</code>).
                </li>
                <li>
                  <b>Kapasitas & Alokasi Meja:</b> Sistem otomatis mencocokkan meja yang cukup dengan jumlah pax yang diminta.
                </li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setInfoOpen(false)}
              className="tap h-10 px-5 rounded-xl bg-[#18181B] text-white font-bold text-xs"
            >
              Tutup
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Dialog Buat Reservasi Manual */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="reservation-dialog">
          <DialogHeader>
            <DialogTitle>Buat Reservasi Manual (Kasir)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Nama Pemesan</label>
              <input
                data-testid="res-name"
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                className="mt-1 w-full h-11 rounded-xl border px-3"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">No. HP</label>
              <input
                data-testid="res-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="628xxx"
                className="mt-1 w-full h-11 rounded-xl border px-3 font-num"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Meja</label>
                <select
                  data-testid="res-table"
                  value={form.table_id}
                  onChange={(e) => setForm({ ...form, table_id: e.target.value })}
                  className="mt-1 w-full h-11 rounded-xl border px-3 bg-white"
                >
                  <option value="">— pilih —</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Kapasitas: {t.capacity || 4})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Jam</label>
                <input
                  data-testid="res-time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="mt-1 w-full h-11 rounded-xl border px-3 font-num"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Jumlah Orang</label>
                <input
                  data-testid="res-pax"
                  type="number"
                  min="1"
                  value={form.pax}
                  onChange={(e) => setForm({ ...form, pax: e.target.value })}
                  className="mt-1 w-full h-11 rounded-xl border px-3 font-num"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Tanggal</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full h-11 rounded-xl border px-3 font-num"
                />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Catatan</label>
              <input
                data-testid="res-note"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="opsional"
                className="mt-1 w-full h-11 rounded-xl border px-3"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              data-testid="save-reservation"
              onClick={save}
              className="tap h-11 px-6 rounded-xl bg-[#E63946] text-white font-bold"
            >
              Simpan Reservasi
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
