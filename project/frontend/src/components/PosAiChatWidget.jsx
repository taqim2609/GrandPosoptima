import { useState, useEffect, useRef } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdmin } from "@/lib/rbac";
import { featBool } from "@/lib/features";
import {
  Sparkles, MessageSquare, Send, Loader2, Bot, User, Trash2,
  X, Maximize2, Minimize2, Lightbulb, Code2, AlertTriangle, CheckCircle2,
  TrendingUp, Shield, HelpCircle, Layers, RefreshCw
} from "lucide-react";

const SUGGESTIONS = [
  "📊 Berapa total omzet dan transaksi hari ini?",
  "⚠️ Ada stok produk atau bahan baku yang hampir habis?",
  "💡 Berikan saran promosi untuk meningkatkan penjualan malam ini",
  "🪑 Bagaimana status keterisian meja restoran saat ini?",
  "👥 Siapa kasir yang sedang aktif dan berapa kas awalnya?",
];

export default function PosAiChatWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("chat"); // 'chat' | 'ticket'
  
  // Chat States
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Halo Superadmin! Saya asisten Gemini AI POS Grand Aceh Kuliner. Anda bisa bertanya tentang omzet, status meja, stok bahan, atau mengirimkan instruksi fitur ke AI Studio langsung dari sini.",
      time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiRole, setAiRole] = useState("general"); // 'general' | 'operations' | 'analyst' | 'specialist'
  const [sessionId, setSessionId] = useState(() => "pos_sess_" + Date.now());
  const chatBottomRef = useRef(null);

  // Ticket / Feature Request to AI Studio States
  const [ticketMessage, setTicketMessage] = useState("");
  const [ticketPriority, setTicketPriority] = useState("normal");
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [recentTickets, setRecentTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Check Superadmin permission & Feature flag
  const isSuper = isSuperAdmin(user) || user?.role === "superadmin" || user?.is_superadmin || user?.bootstrap_owner || user?.perms_full;
  const isEnabled = featBool("ai.pos_chat") !== false && featBool("ai.enabled") !== false;

  useEffect(() => {
    if (isOpen && activeTab === "chat") {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, activeTab]);

  const loadTickets = async () => {
    try {
      setLoadingTickets(true);
      const res = await api.get("/feature-requests");
      setRecentTickets(res.data || []);
    } catch (e) {
      console.warn("Failed to load feature requests:", e);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === "ticket") {
      loadTickets();
    }
  }, [isOpen, activeTab]);

  if (!isSuper || !isEnabled) {
    return null;
  }

  const handleSendMessage = async (customText = null) => {
    const textToSend = (customText || input).trim();
    if (!textToSend || loading) return;

    const userMsg = {
      role: "user",
      text: textToSend,
      time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInput("");
    setLoading(true);

    try {
      const res = await api.post("/ai/assistant/chat", {
        message: textToSend,
        session_id: sessionId,
        role: aiRole,
        model: "gemini-2.5-flash",
      });

      const reply = res.data?.reply || "Maaf, tidak ada respons yang dihasilkan.";
      const assistantMsg = {
        role: "assistant",
        text: reply,
        time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg = {
        role: "assistant",
        text: "⚠️ Gagal terhubung ke layanan AI: " + apiError(err.response?.data?.detail || err.message),
        time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    if (!window.confirm("Bersihkan riwayat chat di sesi ini?")) return;
    setMessages([
      {
        role: "assistant",
        text: "Riwayat percakapan telah dibersihkan. Ada yang bisa saya bantu terkait operasional POS?",
        time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setSessionId("pos_sess_" + Date.now());
    toast.info("Riwayat chat direset");
  };

  const handleSendTicket = async (e) => {
    e?.preventDefault();
    const msg = ticketMessage.trim();
    if (!msg) {
      toast.error("Tuliskan detail instruksi atau fitur yang diinginkan");
      return;
    }

    setSubmittingTicket(true);
    try {
      const res = await api.post("/feature-requests", {
        message: msg,
        priority: ticketPriority,
        sender: `${user?.name || "Superadmin"} (POS Live)`,
        context: `POS Screen | User: ${user?.username || "superadmin"} | Time: ${new Date().toISOString()}`,
      });

      toast.success(res.data?.message || "Instruksi berhasil dikirim ke Google AI Studio!");
      setTicketMessage("");
      loadTickets();
    } catch (err) {
      toast.error("Gagal mengirim ke AI Studio: " + apiError(err.response?.data?.detail || err.message));
    } finally {
      setSubmittingTicket(false);
    }
  };

  return (
    <>
      {/* Floating Button in POS (Superadmin Only) */}
      {!isOpen && (
        <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2">
          <button
            type="button"
            data-testid="pos-ai-floating-btn"
            onClick={() => setIsOpen(true)}
            className="group relative flex items-center gap-2 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-rose-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 border-2 border-white/20"
            title="Chat Gemini AI & Perintah AI Studio (Superadmin)"
          >
            <div className="relative">
              <Sparkles size={18} className="animate-pulse" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-300"></span>
              </span>
            </div>
            <span className="font-extrabold text-xs sm:text-sm tracking-wide hidden sm:inline">
              Gemini &amp; AI Studio
            </span>
            <span className="text-[10px] uppercase font-black bg-white/20 px-1.5 py-0.5 rounded-md">
              VIP
            </span>
          </button>
        </div>
      )}

      {/* Main Drawer / Modal Widget */}
      {isOpen && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[460px] md:w-[500px] bg-white z-50 shadow-2xl border-l flex flex-col transition-all duration-300 animate-in slide-in-from-right">
          {/* Header */}
          <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 text-white p-4 border-b flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-inner">
                <Sparkles size={18} className="text-white animate-spin-slow" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm text-white">Gemini &amp; AI Studio</h3>
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Superadmin
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">Live AI Assistant &amp; Studio Dispatch</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title="Tutup Widget"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Dual Tabs Navigation */}
          <div className="flex items-center border-b bg-zinc-50 shrink-0 p-1 gap-1">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                activeTab === "chat"
                  ? "bg-white text-violet-700 shadow-xs border"
                  : "text-zinc-600 hover:bg-zinc-200/50"
              }`}
            >
              <MessageSquare size={14} />
              <span>1. Chat Asisten Gemini</span>
            </button>
            <button
              onClick={() => setActiveTab("ticket")}
              className={`flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                activeTab === "ticket"
                  ? "bg-white text-rose-600 shadow-xs border"
                  : "text-zinc-600 hover:bg-zinc-200/50"
              }`}
            >
              <Code2 size={14} />
              <span>2. Kirim Tugas ke AI Studio</span>
            </button>
          </div>

          {/* TAB 1: Chat Asisten Gemini */}
          {activeTab === "chat" && (
            <div className="flex-1 flex flex-col overflow-hidden bg-zinc-50/50">
              {/* Persona Selector & Clear Action */}
              <div className="px-3 py-2 bg-white border-b flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {[
                    { id: "general", label: "Umum" },
                    { id: "operations", label: "Operasional" },
                    { id: "analyst", label: "Analis Omzet" },
                    { id: "specialist", label: "Menu & Stok" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setAiRole(p.id)}
                      className={`tap px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                        aiRole === p.id
                          ? "bg-violet-100 text-violet-800 border border-violet-300"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={clearChat}
                  title="Reset Sesi Chat"
                  className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Chat Message Stream */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <div
                      className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                        m.role === "user"
                          ? "bg-zinc-800 text-white"
                          : m.isError
                          ? "bg-rose-100 text-rose-600"
                          : "bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-xs"
                      }`}
                    >
                      {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
                    </div>

                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-zinc-900 text-white rounded-tr-none shadow-xs"
                          : m.isError
                          ? "bg-rose-50 border border-rose-200 text-rose-900 rounded-tl-none"
                          : "bg-white border border-zinc-200 text-zinc-900 rounded-tl-none shadow-xs"
                      }`}
                    >
                      <div className="whitespace-pre-wrap font-sans">{m.text}</div>
                      <div
                        className={`text-[10px] mt-1 text-right font-mono ${
                          m.role === "user" ? "text-zinc-400" : "text-zinc-400"
                        }`}
                      >
                        {m.time}
                      </div>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex items-center gap-2 text-xs font-bold text-violet-600 p-2 bg-violet-50 rounded-xl border border-violet-200 w-fit animate-pulse">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Gemini sedang menganalisis data POS...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Suggestions Quick Bar */}
              <div className="p-2 border-t bg-white shrink-0 overflow-x-auto no-scrollbar flex items-center gap-1.5">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(s)}
                    disabled={loading}
                    className="tap shrink-0 px-2.5 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 text-[11px] font-semibold text-zinc-700 transition-colors border"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="p-3 bg-white border-t flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ketik pertanyaan atau perintah POS ke Gemini..."
                  className="flex-1 h-10 px-3 rounded-xl border border-zinc-300 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/10 text-xs outline-none transition-all"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="h-10 px-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold flex items-center justify-center gap-1 text-xs disabled:opacity-40 transition-all shadow-xs"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: Kirim Tugas / Tiket ke AI Studio Builder */}
          {activeTab === "ticket" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/60">
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs text-rose-950">
                <div className="flex items-center gap-1.5 font-black text-rose-700 mb-1">
                  <Code2 size={15} />
                  <span>Jalur Perintah Langsung ke Google AI Studio</span>
                </div>
                Pesan atau instruksi yang dikirim dari sini akan langsung tersimpan di file <b>feature-requests.jsonl</b> dan dapat segera dikerjakan oleh AI Studio saat sesi pemrograman dibuka.
              </div>

              <form onSubmit={handleSendTicket} className="space-y-3 bg-white p-4 rounded-2xl border shadow-xs">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Tingkat Prioritas:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "normal", label: "Biasa", cls: "bg-blue-50 text-blue-700 border-blue-200" },
                      { id: "feature", label: "Fitur Baru", cls: "bg-purple-50 text-purple-700 border-purple-200" },
                      { id: "urgent", label: "Mendesak / Bug", cls: "bg-rose-50 text-rose-700 border-rose-200" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setTicketPriority(p.id)}
                        className={`py-1.5 px-2 rounded-xl text-xs font-extrabold border transition-all ${
                          ticketPriority === p.id
                            ? `${p.cls} ring-2 ring-zinc-900 shadow-xs`
                            : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Instruksi Modifikasi / Permintaan Fitur:
                  </label>
                  <textarea
                    rows={4}
                    value={ticketMessage}
                    onChange={(e) => setTicketMessage(e.target.value)}
                    placeholder="Contoh: Tambahkan tombol cetak rekap per kasir di menu laporan, atau ubah warna header nota kasir..."
                    className="w-full rounded-xl border border-zinc-300 p-3 text-xs outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 resize-none transition-all"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingTicket || !ticketMessage.trim()}
                  className="tap w-full h-11 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {submittingTicket ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={15} />
                  )}
                  <span>Kirim Perintah ke AI Studio</span>
                </button>
              </form>

              {/* History of Feature Requests */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs text-zinc-700 flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>Daftar Perintah &amp; Tiket Terkirim ({recentTickets.length})</span>
                  </h4>
                  <button
                    type="button"
                    onClick={loadTickets}
                    disabled={loadingTickets}
                    className="text-[11px] font-bold text-zinc-500 hover:text-zinc-800 flex items-center gap-1"
                  >
                    <RefreshCw size={11} className={loadingTickets ? "animate-spin" : ""} />
                    <span>Muat Ulang</span>
                  </button>
                </div>

                {loadingTickets ? (
                  <div className="p-4 text-center text-xs text-zinc-400">
                    <Loader2 size={16} className="animate-spin mx-auto mb-1 text-zinc-400" />
                    Memuat daftar tiket...
                  </div>
                ) : recentTickets.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-400 bg-white rounded-xl border">
                    Belum ada instruksi yang dikirim dari POS.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {recentTickets.map((t) => (
                      <div key={t.id} className="p-3 bg-white rounded-xl border text-xs shadow-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              t.priority === "urgent"
                                ? "bg-rose-100 text-rose-700"
                                : t.priority === "feature"
                                ? "bg-purple-100 text-purple-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {t.priority || "normal"}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {new Date(t.created_at || Date.now()).toLocaleTimeString("id-ID", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="font-medium text-zinc-800 whitespace-pre-wrap">{t.message}</p>
                        <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 pt-0.5">
                          <CheckCircle2 size={11} /> Tersimpan di antrean AI Studio
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
