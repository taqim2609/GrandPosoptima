import { useEffect, useState, useRef } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import {
  MessageCircle, Loader2, Save, Send, RefreshCw, CheckCircle2,
  KeyRound, Sliders, Zap, Search, ShieldAlert, PhoneCall, CheckCheck,
  Receipt, FileText, Bookmark, Settings, Layers, AlertTriangle, ArrowRight,
  Server, ShieldCheck, PanelLeftClose, PanelLeftOpen, Info
} from "lucide-react";

export default function WhatsApp() {
  const [activeTab, setActiveTab] = useState("livechat"); // "livechat" | "settings"
  const [loading, setLoading] = useState(true);

  // Live Chat States
  const [chats, setChats] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatSearch, setChatSearch] = useState("");
  const [chatListCollapsed, setChatListCollapsed] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const messagesEndRef = useRef(null);

  // Gateway Status & Configuration States
  const [statusState, setStatusState] = useState("disconnected");
  const [statusChecking, setStatusChecking] = useState(false);
  const [hermes, setHermes] = useState({
    configured: false,
    state: "unconfigured",
    api_url: "",
    localhost_only: false,
    secret_masked: "",
    allowlist: {},
    node_id: "",
    node_mode: "primary",
    bot: "",
    error: "",
  });

  // Wacloud Failover States
  const [wacloud, setWacloud] = useState({
    api_key: "",
    base_url: "https://app.wacloud.id/api/v1",
    device_id: "",
    auto_failover: true,
    has_key: false,
  });
  const [savingWacloud, setSavingWacloud] = useState(false);

  // Outbox States
  const [outbox, setOutbox] = useState({ pending: 0, recent_failures: [], bridge_configured: false });
  const [dispatching, setDispatching] = useState(false);

  // Testing States
  const [testNo, setTestNo] = useState("");
  const [testing, setTesting] = useState(false);

  // Reservation Rules States
  const [groupOnly, setGroupOnly] = useState(true);
  const [resKeywords, setResKeywords] = useState("#reservasi, #booking, !reservasi, reservasi");
  const [targetGroupId, setTargetGroupId] = useState("");
  const [replyGroup, setReplyGroup] = useState(true);
  const [sendPrivate, setSendPrivate] = useState(true);
  const [rejectPrivate, setRejectPrivate] = useState(true);
  const [savingResRules, setSavingResRules] = useState(false);

  // Quick Action States
  const [quickOrder, setQuickOrder] = useState(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadChats = async (searchTerm = "") => {
    try {
      const res = await api.get("/whatsapp/chats", { params: { search: searchTerm } });
      const list = res.data?.chats || [];
      setChats(list);
      if (!selectedPhone && list.length > 0) {
        setSelectedPhone(list[0].phone);
      }
    } catch (e) {
      // quiet fallback
    }
  };

  const loadMessages = async (phone) => {
    if (!phone) return;
    setChatLoading(true);
    try {
      const res = await api.get(`/whatsapp/chats/${phone}/messages`);
      setMessages(res.data?.messages || []);
      setTimeout(scrollToBottom, 100);
    } catch (e) {
      toast.error("Gagal memuat pesan percakapan");
    } finally {
      setChatLoading(false);
    }
  };

  const loadHermesStatus = async () => {
    try {
      const r = await api.get("/whatsapp/hermes/status");
      const d = r.data || {};
      setHermes({
        configured: d.state !== "unconfigured",
        state: d.state || "unconfigured",
        api_url: d.api_url || "",
        localhost_only: !!d.localhost_only,
        secret_masked: d.secret_masked || "",
        allowlist: d.allowlist || {},
        node_id: d.node_id || "",
        node_mode: d.node_mode || "primary",
        bot: d.details?.bot || "",
        error: d.details?.error || "",
      });
      setStatusState(d.status || "disconnected");
    } catch (e) {
      setHermes((h) => ({ ...h, state: "offline" }));
      setStatusState("disconnected");
    }
    try {
      const o = await api.get("/whatsapp/outbox");
      setOutbox(o.data || { pending: 0, recent_failures: [], bridge_configured: false });
    } catch (e) {
      /* ignore */
    }
  };

  const loadAllConfig = async () => {
    try {
      const r = await api.get("/whatsapp/config");
      const c = r.data || {};
      setGroupOnly(c.group_only_reservation !== false);
      setResKeywords(c.reservation_keywords || "#reservasi, #booking, !reservasi, reservasi");
      setTargetGroupId(c.target_group_id || "");
      setReplyGroup(c.reply_to_group !== false);
      setSendPrivate(c.send_private_confirm !== false);
      setRejectPrivate(c.reject_private_booking !== false);
      if (c.phone) setTestNo(c.phone);

      setWacloud({
        api_key: c.api_key_masked || "",
        base_url: c.base_url || "https://app.wacloud.id/api/v1",
        device_id: c.device_id || "",
        auto_failover: c.auto_failover !== false,
        has_key: !!c.api_key_set,
      });

      await loadHermesStatus();
      await loadChats();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllConfig();
    const interval = setInterval(() => {
      loadChats(chatSearch);
      if (selectedPhone) loadMessages(selectedPhone);
    }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedPhone) {
      loadMessages(selectedPhone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhone]);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!selectedPhone || !messageText.trim()) return;

    setSendingMsg(true);
    const textToSend = messageText.trim();
    setMessageText("");

    try {
      const res = await api.post(`/whatsapp/chats/${selectedPhone}/send`, { text: textToSend });
      if (res.data?.message) {
        setMessages((prev) => [...prev, res.data.message]);
        setTimeout(scrollToBottom, 80);
      }
      toast.success("Pesan terkirim");
      loadChats(chatSearch);
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setSendingMsg(false);
    }
  };

  const handleSaveWacloud = async () => {
    setSavingWacloud(true);
    try {
      await api.put("/whatsapp/config", {
        base_url: wacloud.base_url,
        device_id: wacloud.device_id,
        auto_failover: wacloud.auto_failover,
        ...(wacloud.api_key && !wacloud.api_key.includes("•") ? { api_key: wacloud.api_key } : {}),
      });
      toast.success("Pengaturan Failover wacloud.id berhasil disimpan!");
      await loadAllConfig();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSavingWacloud(false);
    }
  };

  const handleSendTest = async () => {
    if (!testNo.trim()) {
      toast.error("Isi nomor WhatsApp tujuan tes");
      return;
    }
    setTesting(true);
    try {
      const r = await api.post("/whatsapp/test", { to: testNo.trim() });
      toast.success(r.data.message || "Pesan tes berhasil dikirim!");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setTesting(false);
    }
  };

  const handleCheckConnection = async () => {
    setStatusChecking(true);
    try {
      const r = await api.get("/whatsapp/status");
      setStatusState(r.data.status || "connected");
      if (r.data.status === "connected" || r.data.state === "open") {
        toast.success("WhatsApp Gateway Hermes Utama Terhubung!");
      } else {
        toast.info(`Status Gateway: ${r.data.state || r.data.status}`);
      }
      await loadHermesStatus();
    } catch (e) {
      toast.error("Gagal memeriksa status koneksi");
    } finally {
      setStatusChecking(false);
    }
  };

  const [syncingCrossServer, setSyncingCrossServer] = useState(false);

  const handleSyncUpstream = async () => {
    setSyncingCrossServer(true);
    try {
      const r = await api.post("/whatsapp/outbox/sync-upstream");
      const d = r.data || {};
      if (d.mode === "upstream_sync") {
        toast.success(`Sinkronisasi beda server ke Google Cloud berhasil! Sent: ${d.sent || 0}`);
      } else {
        toast.info(`Outbox diproses (${d.sent || 0} terkirim)`);
      }
      await loadHermesStatus();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSyncingCrossServer(false);
    }
  };

  const handleDispatchOutbox = async () => {
    setDispatching(true);
    try {
      const r = await api.post("/whatsapp/outbox/dispatch");
      const d = r.data || {};
      if (d.skipped) {
        toast.info("Node ini tidak punya bridge — outbox dikirim via failover atau server utama.");
      } else {
        toast.success(`Outbox dikirim: ${d.sent || 0} berhasil, ${d.failed || 0} gagal`);
      }
      await loadHermesStatus();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setDispatching(false);
    }
  };

  const handleSaveResRules = async () => {
    setSavingResRules(true);
    try {
      await api.post("/whatsapp/reservation-settings", {
        group_only_reservation: groupOnly,
        reservation_keywords: resKeywords,
        target_group_id: targetGroupId.trim(),
        reply_to_group: replyGroup,
        send_private_confirm: sendPrivate,
        reject_private_booking: rejectPrivate,
      });
      toast.success("Aturan reservasi grup & kata kunci berhasil disimpan!");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSavingResRules(false);
    }
  };

  const insertQuickTemplate = (templateText) => {
    setMessageText((prev) => (prev ? `${prev}\n${templateText}` : templateText));
  };

  if (loading) {
    return (
      <div className="h-full grid place-items-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-emerald-500" size={32} />
          <span className="text-xs font-semibold tracking-wide text-slate-400">Memuat WhatsApp Gateway & Live Chat...</span>
        </div>
      </div>
    );
  }

  const isConnected = hermes.state === "open" || statusState === "connected";

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden" data-testid="wa-livechat-page">
      {/* HEADER NAV TAB CONTRACT */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-slate-900 border-b border-slate-800 text-white shrink-0">
        <div className="flex items-center gap-3 min-w-0 shrink">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
            <MessageCircle size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white leading-tight truncate">
              WhatsApp Center
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[200px] sm:max-w-xs">
              Hermes + Failover wacloud.id
            </p>
          </div>
        </div>

        {/* 2 MAIN SUB-TABS */}
        <div className="flex items-center gap-1 p-1 bg-slate-800/80 rounded-xl border border-slate-700/50">
          <button
            onClick={() => setActiveTab("livechat")}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
              activeTab === "livechat"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <MessageCircle size={14} />
            Live Chat (WhatsApp Web)
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
              activeTab === "settings"
                ? "bg-slate-700 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Settings size={14} />
            Pengaturan &amp; Failover
          </button>
        </div>

        {/* STATUS BADGE */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <div className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-2 ${
            isConnected
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          }`}>
            <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
            {isConnected ? "Hermes Primary Online" : "Failover Mode Ready"}
          </div>
        </div>
      </header>

      {/* VIEWPORT CONTENT */}
      {activeTab === "livechat" ? (
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT SIDEBAR: CHAT THREADS LIST (COLLAPSIBLE) */}
          <div className={`${chatListCollapsed ? "w-16" : "w-80 lg:w-96"} bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-200`}>
            {/* SEARCH BAR & COLLAPSE TOGGLE */}
            <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
              {!chatListCollapsed ? (
                <>
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={chatSearch}
                      onChange={(e) => {
                        setChatSearch(e.target.value);
                        loadChats(e.target.value);
                      }}
                      placeholder="Cari kontak, nomor, atau pesan..."
                      className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-xs outline-none focus:border-emerald-500 bg-white"
                    />
                  </div>
                  <button
                    onClick={() => setChatListCollapsed(true)}
                    title="Ciutkan Daftar Chat (Collapse)"
                    className="p-2 rounded-lg bg-slate-200/70 hover:bg-slate-200 text-slate-600 transition-colors shrink-0"
                  >
                    <PanelLeftClose size={16} />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setChatListCollapsed(false)}
                  title="Buka Daftar Chat (Expand)"
                  className="w-full h-9 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center transition-colors"
                >
                  <PanelLeftOpen size={18} />
                </button>
              )}
            </div>

            {/* CHAT LIST */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {chats.length === 0 ? (
                <div className="p-4 text-center space-y-2">
                  <MessageCircle size={24} className="mx-auto text-slate-300" />
                  {!chatListCollapsed && (
                    <>
                      <p className="text-xs text-slate-500 font-medium">Belum ada percakapan WhatsApp</p>
                      <p className="text-[11px] text-slate-400">Pesan masuk dari pelanggan akan tampil secara real-time di sini.</p>
                    </>
                  )}
                </div>
              ) : (
                chats.map((c) => {
                  const isSelected = c.phone === selectedPhone;
                  if (chatListCollapsed) {
                    return (
                      <button
                        key={c.phone}
                        onClick={() => setSelectedPhone(c.phone)}
                        title={`${c.name || c.phone}: ${c.last_message || "Pesan"}`}
                        className={`w-full py-3 flex flex-col items-center justify-center relative transition-colors ${
                          isSelected ? "bg-emerald-50 border-l-4 border-l-emerald-600" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="h-9 w-9 rounded-full bg-slate-900 text-white font-extrabold text-xs grid place-items-center shrink-0">
                          {(c.name || c.phone || "WA").slice(0, 2).toUpperCase()}
                        </div>
                        {c.unread_count > 0 && (
                          <span className="absolute top-2 right-2 h-4 px-1 rounded-full bg-emerald-600 text-white text-[9px] font-black grid place-items-center">
                            {c.unread_count}
                          </span>
                        )}
                      </button>
                    );
                  }

                  return (
                    <button
                      key={c.phone}
                      onClick={() => setSelectedPhone(c.phone)}
                      className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 ${
                        isSelected ? "bg-emerald-50/70 border-l-4 border-l-emerald-600" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="h-10 w-10 rounded-full bg-slate-900 text-white font-extrabold text-xs grid place-items-center shrink-0">
                        {(c.name || c.phone || "WA").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-extrabold text-xs text-slate-900 truncate">
                            {c.name || c.phone}
                          </span>
                          <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
                            {c.updated_at ? new Date(c.updated_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : ""}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {c.last_message || "Belum ada pesan"}
                        </p>
                      </div>
                      {c.unread_count > 0 && (
                        <span className="h-5 px-1.5 rounded-full bg-emerald-600 text-white text-[10px] font-black grid place-items-center shrink-0">
                          {c.unread_count}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT VIEWPORT: ACTIVE CHAT CONVERSATION */}
          <div className="flex-1 flex flex-col bg-[#efeae2] dark:bg-slate-950 relative">
            {selectedPhone ? (
              <>
                {/* ACTIVE CHAT HEADER */}
                <div className="p-3.5 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    {chatListCollapsed && (
                      <button
                        onClick={() => setChatListCollapsed(false)}
                        title="Buka Daftar Kontak (Expand Chat List)"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-colors"
                      >
                        <PanelLeftOpen size={16} />
                      </button>
                    )}
                    <div className="h-9 w-9 rounded-full bg-emerald-600 text-white font-extrabold text-xs grid place-items-center shrink-0">
                      {selectedPhone.slice(-2)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold text-xs text-white truncate">{selectedPhone}</div>
                      <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                        <CheckCheck size={12} /> Live WhatsApp Stream
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadMessages(selectedPhone)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 font-bold"
                    >
                      <RefreshCw size={13} className={chatLoading ? "animate-spin" : ""} />
                      Segarkan
                    </button>
                  </div>
                </div>

                {/* MESSAGE STREAM BUBBLES */}
                <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-3">
                  {messages.length === 0 ? (
                    <div className="h-full grid place-items-center">
                      <div className="bg-white/90 backdrop-blur-xs rounded-2xl p-6 text-center border shadow-xs max-w-sm">
                        <MessageCircle size={32} className="mx-auto text-emerald-600 mb-2" />
                        <h4 className="font-extrabold text-sm text-slate-900">Mulai Percakapan WhatsApp</h4>
                        <p className="text-xs text-slate-500 mt-1">
                          Ketik pesan di bawah untuk mengirim pesan balasan, struk belanja, atau konfirmasi reservasi.
                        </p>
                      </div>
                    </div>
                  ) : (
                    messages.map((m, idx) => {
                      const isOutbound = m.direction === "outbound" || m.sender === "kasir" || m.sender === "bot";
                      return (
                        <div
                          key={m.id || idx}
                          className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] lg:max-w-[65%] rounded-2xl p-3 shadow-xs text-xs space-y-1 ${
                              isOutbound
                                ? "bg-[#d9fdd3] text-slate-900 rounded-tr-none border border-emerald-200"
                                : "bg-white text-slate-900 rounded-tl-none border border-slate-200"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 text-[10px] text-slate-500 font-medium border-b border-black/5 pb-1">
                              <span className="font-bold">
                                {isOutbound ? (m.sender_name || "Kasir Grand POS") : selectedPhone}
                              </span>
                              <span className="font-mono tabular-nums">
                                {m.created_at ? new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : ""}
                              </span>
                            </div>

                            <p className="whitespace-pre-wrap leading-relaxed text-slate-800">
                              {m.text}
                            </p>

                            {isOutbound && (
                              <div className="flex items-center justify-end gap-1 text-[9px] text-slate-400 pt-0.5">
                                <span className="font-mono uppercase">{m.provider || "hermes"}</span>
                                <CheckCheck size={12} className="text-emerald-600" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* POS QUICK SHORTCUTS & TEMPLATES TOOLBAR */}
                <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                    Quick POS Actions:
                  </span>
                  <button
                    onClick={() => insertQuickTemplate("Terima kasih telah berkunjung ke Grand Aceh Kuliner! Berikut nomor rekening resmi: Bank Aceh 0102030405 a/n Grand Aceh Kuliner.")}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] whitespace-nowrap shrink-0 flex items-center gap-1.5 border border-slate-700"
                  >
                    <Receipt size={12} className="text-emerald-400" />
                    Info Rekening QRIS
                  </button>
                  <button
                    onClick={() => insertQuickTemplate("Pesanan Anda telah kami terima dan sedang diproses oleh dapur kami. Mohon menunggu sebentar. Terima kasih!")}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] whitespace-nowrap shrink-0 flex items-center gap-1.5 border border-slate-700"
                  >
                    <FileText size={12} className="text-indigo-400" />
                    Konfirmasi Dapur
                  </button>
                  <button
                    onClick={() => insertQuickTemplate("Halo! Reservasi meja Anda telah dikonfirmasi oleh tim Grand Aceh Kuliner. Sampai jumpa di restoran kami!")}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] whitespace-nowrap shrink-0 flex items-center gap-1.5 border border-slate-700"
                  >
                    <Bookmark size={12} className="text-amber-400" />
                    Konfirmasi Meja
                  </button>
                </div>

                {/* TEXT INPUT FORM */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
                >
                  <input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder={`Tulis pesan WhatsApp ke ${selectedPhone}...`}
                    className="flex-1 h-11 px-4 rounded-xl border border-slate-200 text-xs outline-none focus:border-emerald-500 font-sans"
                  />
                  <button
                    type="submit"
                    disabled={sendingMsg || !messageText.trim()}
                    className="h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50 transition-colors shadow-xs"
                  >
                    {sendingMsg ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    Kirim
                  </button>
                </form>
              </>
            ) : (
              <div className="h-full grid place-items-center p-8 text-center">
                <div className="bg-white rounded-3xl p-8 border shadow-sm max-w-sm space-y-3">
                  <div className="h-16 w-16 rounded-2xl bg-emerald-50 text-emerald-600 grid place-items-center mx-auto">
                    <MessageCircle size={36} />
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900">Pilih Kontak WhatsApp</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Pilih kontak di sebelah kiri untuk membuka ruang obrolan WhatsApp Web atau mengirim pesan balasan secara langsung.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TAB 2: PENGATURAN & FAILOVER GATEWAY */
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6 max-w-4xl mx-auto w-full">
          {/* DUAL PROVIDER ARCHITECTURE BANNER */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-md space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Layers size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight text-white">
                    Arsitektur WhatsApp Multi-Provider POS
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Prioritas Utama: Hermes Baileys (Server Toko) | Failover Otomatis: wacloud.id REST API
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                Auto Failover Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1.5">
                    <Server size={14} /> Primary Gateway (Hermes)
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    isConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                  }`}>
                    {isConnected ? "Online" : "Standby"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Menjalankan Baileys langsung di server toko dengan nomor bot terpisah. Menyinkronkan percakapan 2 arah &amp; bebas kuota.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-indigo-400 flex items-center gap-1.5">
                    <ShieldCheck size={14} /> Failover Gateway (wacloud.id)
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    wacloud.has_key ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-400"
                  }`}>
                    {wacloud.has_key ? "Tersedia" : "Belum diatur"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  URL REST API: <code className="font-mono text-indigo-300">https://app.wacloud.id/api/v1</code>. Mengambil alih pengiriman otomatis bila Hermes offline/gagal.
                </p>
              </div>
            </div>
          </div>

          {/* CARD 1: HERMES STATUS */}
          <div className="bg-white rounded-2xl border p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b pb-3">
              <div className="flex items-center gap-2 font-extrabold text-sm text-slate-900">
                <Zap size={18} className="text-emerald-600" />
                Status Primary Gateway — Hermes Baileys
              </div>
              <button
                onClick={handleCheckConnection}
                disabled={statusChecking}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {statusChecking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Cek Koneksi
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-400">Node Server</span>
                <div className="font-extrabold text-slate-900">{hermes.node_id || "gudang-644"} ({hermes.node_mode})</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-400">Nomor Bot Terpisah</span>
                <div className="font-extrabold text-slate-900">{hermes.bot || "Belum terhubung"}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-400">Endpoint Primary Webhook</span>
                <div className="font-mono text-slate-900 truncate font-bold">
                  {hermes.api_url ? hermes.api_url : "127.0.0.1:8644 (Bridge Toko Lokal)"}
                </div>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
              <Info size={14} className="text-emerald-600 shrink-0" />
              <span>
                <strong>Mengapa Local?</strong> Hermes Primary didesain berjalan sebagai bridge lokal (127.0.0.1 / IP Raspberry Pi toko) demi keamanan sesi WhatsApp. Jika ingin pengiriman cloud murni, aktifkan <strong>wacloud.id REST API</strong> di bawah.
              </span>
            </div>
          </div>

          {/* CARD 2: FAILOVER WACLOUD.ID CONFIGURATION */}
          <div className="bg-white rounded-2xl border p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b pb-3">
              <div className="flex items-center gap-2 font-extrabold text-sm text-slate-900">
                <ShieldCheck size={18} className="text-indigo-600" />
                Konfigurasi Failover — wacloud.id REST API
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                https://app.wacloud.id/api/v1
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-extrabold text-slate-900 block">Base URL API wacloud.id:</label>
                <input
                  value={wacloud.base_url}
                  onChange={(e) => setWacloud({ ...wacloud, base_url: e.target.value })}
                  placeholder="https://app.wacloud.id/api/v1"
                  className="w-full h-11 rounded-xl border border-slate-200 px-3.5 font-mono text-xs outline-none focus:border-indigo-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-extrabold text-slate-900 block">API Key wacloud.id:</label>
                  <input
                    type="password"
                    value={wacloud.api_key}
                    onChange={(e) => setWacloud({ ...wacloud, api_key: e.target.value })}
                    placeholder="Masukkan API Key wacloud.id"
                    className="w-full h-11 rounded-xl border border-slate-200 px-3.5 font-mono text-xs outline-none focus:border-indigo-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-extrabold text-slate-900 block">Device ID wacloud.id:</label>
                  <input
                    value={wacloud.device_id}
                    onChange={(e) => setWacloud({ ...wacloud, device_id: e.target.value })}
                    placeholder="Contoh: dev_123456"
                    className="w-full h-11 rounded-xl border border-slate-200 px-3.5 font-mono text-xs outline-none focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl border bg-slate-50">
                <div>
                  <div className="font-bold text-slate-900">Aktifkan Auto Failover Otomatis</div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Jika Hermes utama tidak dapat dihubungi atau internet Pi terputus, pesan dikirim otomatis via wacloud.id.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={wacloud.auto_failover}
                  onChange={(e) => setWacloud({ ...wacloud, auto_failover: e.target.checked })}
                  className="h-5 w-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveWacloud}
                  disabled={savingWacloud}
                  className="h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-xs disabled:opacity-50 transition-colors"
                >
                  {savingWacloud ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Simpan Pengaturan Failover
                </button>
              </div>
            </div>
          </div>

          {/* CARD 3: TEST MESSAGE SENDER */}
          <div className="bg-white rounded-2xl border p-6 space-y-3 shadow-sm">
            <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <Send size={18} className="text-emerald-600" /> Uji Coba Pengiriman Pesan
            </div>
            <div className="flex gap-2">
              <input
                value={testNo}
                onChange={(e) => setTestNo(e.target.value)}
                placeholder="08123456789 atau 628123456789"
                className="flex-1 h-11 rounded-xl border border-slate-200 px-3.5 font-mono text-xs outline-none focus:border-emerald-600"
              />
              <button
                onClick={handleSendTest}
                disabled={testing}
                className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center gap-2 disabled:opacity-50 transition-colors shadow-xs"
              >
                {testing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Kirim Tes
              </button>
            </div>
          </div>

          {/* CARD 3.5: CROSS-SERVER HERMES SYNC (CLOUD ↔ PI) */}
          <div className="bg-white rounded-2xl border p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b pb-3">
              <div className="flex items-center gap-2 font-extrabold text-sm text-slate-900">
                <RefreshCw size={18} className="text-emerald-600" />
                Jalur Sinkronisasi Hermes Beda Server (Google Cloud ↔ Raspberry Pi)
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Outbox Sync Active
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Jalur ini menghubungkan aplikasi POS di **Google Cloud** dengan gateway Hermes yang berjalan di **Raspberry Pi toko**. Pesan transaksi yang dibuat di cloud otomatis ditarik dan dikirim oleh Hermes Pi melalui API Outbox &amp; token sinkronisasi.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-slate-50 border space-y-1">
                  <span className="text-[10px] font-black uppercase text-slate-400">Status Node Saat Ini</span>
                  <div className="font-extrabold text-slate-900">{hermes.node_mode === "primary" ? "Cloud Master POS" : "Store Bridge Node (Pi)"}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border space-y-1">
                  <span className="text-[10px] font-black uppercase text-slate-400">Otentikasi Sinkronisasi</span>
                  <div className="font-mono text-emerald-700 font-bold">WA_OUTBOX_SYNC_TOKEN Active ✓</div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSyncUpstream}
                  disabled={syncingCrossServer}
                  className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center gap-2 shadow-xs disabled:opacity-50 transition-colors"
                >
                  {syncingCrossServer ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  Sinkronkan Outbox Beda Server Sekarang
                </button>
              </div>
            </div>
          </div>

          {/* CARD 4: OUTBOX QUEUE MANAGER */}
          <div className="bg-white rounded-2xl border p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b pb-3">
              <div>
                <div className="font-extrabold text-sm text-slate-900">Antrean Outbox WhatsApp (Cloud &amp; Pi Sync)</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {outbox.pending} pesan menunggu pengiriman di antrean.
                </div>
              </div>
              <button
                onClick={handleDispatchOutbox}
                disabled={dispatching}
                className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50 transition-colors"
              >
                {dispatching ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Proses Outbox Sekarang
              </button>
            </div>

            {!!(outbox.recent_failures || []).length && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                <span className="font-extrabold">Catatan Kegagalan Terakhir: </span>
                {outbox.recent_failures.map((f, i) => (
                  <span key={i} className="inline-block mr-2 font-mono">
                    {f.kind || "wa"}×{f.attempts || 0}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* CARD 5: GROUP RESERVATION RULES */}
          <div className="bg-white rounded-2xl border p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b pb-3">
              <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Bookmark size={18} className="text-sky-600" />
                Aturan Reservasi: Khusus Grup &amp; Kata Kunci WhatsApp
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                groupOnly ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-slate-100 text-slate-600 border-slate-200"
              }`}>
                {groupOnly ? "Hanya Grup Aktif" : "Semua Chat Diizinkan"}
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between p-3.5 rounded-xl border bg-slate-50">
                <div>
                  <div className="font-bold text-slate-900">Wajib Reservasi Melalui Grup WhatsApp</div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Jika aktif, booking lewat chat pribadi (japri) dialihkan ke grup resmi agar jadwal meja transparan.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={groupOnly}
                  onChange={(e) => setGroupOnly(e.target.checked)}
                  className="h-5 w-5 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-extrabold text-slate-900 block">Kata Kunci Reservasi:</label>
                <input
                  value={resKeywords}
                  onChange={(e) => setResKeywords(e.target.value)}
                  placeholder="#reservasi, #booking, !reservasi, reservasi"
                  className="w-full h-11 rounded-xl border border-slate-200 px-3.5 font-mono text-xs outline-none focus:border-sky-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-extrabold text-slate-900 block">Whitelist ID Grup WhatsApp (Opsional):</label>
                <input
                  value={targetGroupId}
                  onChange={(e) => setTargetGroupId(e.target.value)}
                  placeholder="120363024823904123@g.us"
                  className="w-full h-11 rounded-xl border border-slate-200 px-3.5 font-mono text-xs outline-none focus:border-sky-600"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveResRules}
                  disabled={savingResRules}
                  className="h-11 px-6 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-xs disabled:opacity-50 transition-colors"
                >
                  {savingResRules ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Simpan Aturan Reservasi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
