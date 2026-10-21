import { useState, useEffect } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import {
  Cpu, CheckCircle2, Copy, Play, RefreshCw, Terminal, Layers, FileText,
  Activity, ShieldCheck, Zap, Sparkles, ExternalLink, Code2, AlertTriangle,
  Server, Database, Clock, HelpCircle, ArrowRight, CornerDownRight, Check,
  ChevronDown, ChevronUp, Radio, Sliders, Gift, MessageSquare
} from "lucide-react";

export default function SettingsMCP() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tools, setTools] = useState([]);
  const [resources, setResources] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeTab, setActiveTab] = useState("playground"); // 'playground' | 'config' | 'audit' | 'resources' | 'logs'
  const [selectedClient, setSelectedClient] = useState("claude"); // 'claude' | 'cursor' | 'hermes' | 'curl'
  const [toolCategory, setToolCategory] = useState("all"); // 'all' | 'wa' | 'server' | 'promo' | 'pos'
  const [expandedAuditId, setExpandedAuditId] = useState(null);
  const [auditDomainFilter, setAuditDomainFilter] = useState("all");

  // Playground state
  const [selectedToolName, setSelectedToolName] = useState("pos_get_sales_summary");
  const [toolArgsText, setToolArgsText] = useState('{\n  "date": "today"\n}');
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);

  // Resource reader state
  const [readingUri, setReadingUri] = useState("");
  const [resourceContent, setResourceContent] = useState(null);
  const [readingResource, setReadingResource] = useState(false);

  const [copiedKey, setCopiedKey] = useState(null);

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Konfigurasi berhasil disalin ke clipboard!");
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [resStatus, resTools, resResources, resPrompts, resLogs, resAudit] = await Promise.all([
        api.get("/mcp/status").catch(() => ({ data: null })),
        api.get("/mcp/tools").catch(() => ({ data: { tools: [] } })),
        api.get("/mcp/resources").catch(() => ({ data: { resources: [] } })),
        api.get("/mcp/prompts").catch(() => ({ data: { prompts: [] } })),
        api.get("/mcp/logs").catch(() => ({ data: { logs: [] } })),
        api.get("/agent/audit-logs").catch(() => ({ data: { logs: [] } })),
      ]);

      setStatus(resStatus.data);
      setTools(resTools.data.tools || []);
      setResources(resResources.data.resources || []);
      setPrompts(resPrompts.data.prompts || []);
      setLogs(resLogs.data.logs || []);
      setAuditLogs(resAudit.data.logs || []);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail || "Gagal memuat status MCP"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSelectTool = (tool) => {
    setSelectedToolName(tool.name);
    // Presets for specific tools
    if (tool.name === "pos_manage_whatsapp_config") {
      setToolArgsText('{\n  "action": "get"\n}');
      setExecutionResult(null);
      return;
    }
    if (tool.name === "pos_manage_server_cluster") {
      setToolArgsText('{\n  "action": "get_cluster_health"\n}');
      setExecutionResult(null);
      return;
    }
    if (tool.name === "pos_manage_promos_and_coupons") {
      setToolArgsText('{\n  "action": "list"\n}');
      setExecutionResult(null);
      return;
    }
    if (tool.name === "pos_audit_agent_actions") {
      setToolArgsText('{\n  "domain": "all",\n  "limit": 20\n}');
      setExecutionResult(null);
      return;
    }
    if (tool.name === "pos_get_sales_summary") {
      setToolArgsText('{\n  "date": "today"\n}');
      setExecutionResult(null);
      return;
    }
    if (tool.name === "pos_get_tables_status") {
      setToolArgsText('{\n  "status": "all"\n}');
      setExecutionResult(null);
      return;
    }

    // Build default arguments template from schema
    const defaultArgs = {};
    if (tool.inputSchema?.properties) {
      Object.entries(tool.inputSchema.properties).forEach(([k, v]) => {
        if (v.default !== undefined) {
          defaultArgs[k] = v.default;
        } else if (v.type === "string") {
          defaultArgs[k] = k === "date" ? "today" : "";
        } else if (v.type === "number" || v.type === "integer") {
          defaultArgs[k] = 5;
        } else if (v.type === "boolean") {
          defaultArgs[k] = false;
        }
      });
    }
    setToolArgsText(JSON.stringify(defaultArgs, null, 2));
    setExecutionResult(null);
  };

  const runTool = async () => {
    let parsedArgs = {};
    try {
      if (toolArgsText.trim()) {
        parsedArgs = JSON.parse(toolArgsText);
      }
    } catch (err) {
      toast.error("Format JSON argumen tidak valid: " + err.message);
      return;
    }

    setExecuting(true);
    setExecutionResult(null);
    try {
      const res = await api.post("/mcp/execute", {
        name: selectedToolName,
        arguments: parsedArgs,
      });
      setExecutionResult(res.data);
      toast.success(`Tool ${selectedToolName} berhasil dieksekusi (${res.data.latency_ms} ms)!`);
      // Refresh logs
      api.get("/mcp/logs").then((r) => setLogs(r.data.logs || [])).catch(() => {});
    } catch (e) {
      toast.error(e.response?.data?.error || "Gagal mengeksekusi tool MCP");
      setExecutionResult({
        ok: false,
        error: e.response?.data?.error || e.message,
      });
    } finally {
      setExecuting(false);
    }
  };

  const readSelectedResource = async (uri) => {
    setReadingUri(uri);
    setReadingResource(true);
    setResourceContent(null);
    try {
      const res = await api.get(`/mcp/resources/read?uri=${encodeURIComponent(uri)}`);
      setResourceContent(res.data.content);
      toast.success(`Resource ${uri} berhasil dibaca`);
    } catch (e) {
      toast.error("Gagal membaca resource: " + (e.response?.data?.detail || e.message));
    } finally {
      setReadingResource(false);
    }
  };

  const clearLogs = async () => {
    try {
      await api.delete("/mcp/logs");
      setLogs([]);
      toast.success("Log pemanggilan MCP berhasil dibersihkan");
    } catch (e) {
      toast.error("Gagal membersihkan log");
    }
  };

  const clearAuditLogs = async () => {
    try {
      await api.delete("/agent/audit-logs");
      setAuditLogs([]);
      toast.success("Riwayat audit mutasi agen AI berhasil dibersihkan");
    } catch (e) {
      toast.error("Gagal membersihkan riwayat audit");
    }
  };

  const getToolDomain = (toolName) => {
    if (toolName.includes("whatsapp")) return { label: "WhatsApp", color: "bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]" };
    if (toolName.includes("server")) return { label: "Cluster", color: "bg-[#F3E8FF] text-[#6B21A8] border-[#E9D5FF]" };
    if (toolName.includes("promo")) return { label: "Promo & Banner", color: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]" };
    if (toolName.includes("audit")) return { label: "Audit", color: "bg-[#E0E7FF] text-[#3730A3] border-[#C7D2FE]" };
    return { label: "POS Kasir", color: "bg-[#EFF6FF] text-[#1E40AF] border-[#BFDBFE]" };
  };

  const filteredTools = tools.filter((t) => {
    if (toolCategory === "all") return true;
    if (toolCategory === "wa") return t.name.includes("whatsapp");
    if (toolCategory === "server") return t.name.includes("server");
    if (toolCategory === "promo") return t.name.includes("promo");
    if (toolCategory === "pos") return !t.name.includes("whatsapp") && !t.name.includes("server") && !t.name.includes("promo") && !t.name.includes("audit");
    return true;
  });

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  const claudeConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        "grand-aceh-pos": {
          command: "npx",
          args: ["-y", "mcp-remote", `${currentOrigin}/api/mcp/sse`],
        },
      },
    },
    null,
    2
  );

  const cursorConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        "grand-aceh-pos": {
          url: `${currentOrigin}/api/mcp/sse`,
        },
      },
    },
    null,
    2
  );

  const hermesConfigSnippet = `# Konfigurasi Hermes Agent (~/.hermes/profiles/grandpos-master/profile.yaml)
skills:
  - mcp-pos-data-query
  - pos-admin-controller

mcp_servers:
  grand_aceh_pos:
    transport: sse
    url: "${currentOrigin}/api/mcp/sse"
    timeout: 30

# Fitur Kontrol & Akses yang Didukung:
# 1. MCP Tools (JSON-RPC & SSE):
#    - pos_manage_whatsapp_config (Kelola WA Gateway, QR, webhook, template)
#    - pos_manage_server_cluster  (Pantau Gudang 644 & Raspberry Pi, trigger backup)
#    - pos_manage_promos_and_coupons (Ubah promo kasir, kupon, banner landing page)
#    - pos_audit_agent_actions    (Audit riwayat sebelum/sesudah mutasi)
#
# 2. REST API Terpadu:
#    - GET/PUT  ${currentOrigin}/api/agent/whatsapp
#    - POST     ${currentOrigin}/api/agent/whatsapp/test
#    - GET      ${currentOrigin}/api/agent/server/cluster
#    - POST     ${currentOrigin}/api/agent/server/backup
#    - GET/POST ${currentOrigin}/api/agent/promos
#    - PUT      ${currentOrigin}/api/agent/promos/landing-banner
#    - GET/DEL  ${currentOrigin}/api/agent/audit-logs
`;

  const curlTestSnippet = `curl -X POST "${currentOrigin}/api/mcp" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "pos_get_sales_summary",
      "arguments": { "date": "today" }
    }
  }'`;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
              <Cpu size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-[#18181B]">Model Context Protocol (MCP)</h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]">
                  <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse"></span>
                  Server Aktif (v2024-11-05)
                </span>
              </div>
              <p className="text-sm text-[#71717A] mt-0.5">
                Standar terbuka Anthropic untuk menghubungkan Claude Desktop, Cursor, Hermes Agent, dan AI POS langsung ke database restoran secara aman.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-xl border border-[#E4E4E7] bg-white hover:bg-[#F4F4F5] text-[#18181B] transition-colors"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Segarkan Status
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
          <div className="flex items-center justify-between text-[#71717A] text-xs font-medium mb-1">
            <span>Tools Tersedia</span>
            <Zap size={15} className="text-[#2563EB]" />
          </div>
          <div className="text-2xl font-extrabold text-[#18181B]">{tools.length || 11}</div>
          <div className="text-xs text-[#059669] font-medium mt-1">Siap dipanggil oleh AI</div>
        </div>

        <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
          <div className="flex items-center justify-between text-[#71717A] text-xs font-medium mb-1">
            <span>Resources POS</span>
            <Database size={15} className="text-[#059669]" />
          </div>
          <div className="text-2xl font-extrabold text-[#18181B]">{resources.length || 5}</div>
          <div className="text-xs text-[#71717A] mt-1">URI pos:// catalog, omzet, stok</div>
        </div>

        <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
          <div className="flex items-center justify-between text-[#71717A] text-xs font-medium mb-1">
            <span>System Prompts</span>
            <FileText size={15} className="text-[#D97706]" />
          </div>
          <div className="text-2xl font-extrabold text-[#18181B]">{prompts.length || 4}</div>
          <div className="text-xs text-[#71717A] mt-1">Audit shift, HPP & resep</div>
        </div>

        <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
          <div className="flex items-center justify-between text-[#71717A] text-xs font-medium mb-1">
            <span>Protokol & Transport</span>
            <Server size={15} className="text-[#9333EA]" />
          </div>
          <div className="text-base font-bold text-[#18181B]">JSON-RPC + SSE</div>
          <div className="text-xs text-[#71717A] mt-1">POST &amp; EventSource /sse</div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-[#E4E4E7] gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("playground")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "playground"
              ? "border-[#2563EB] text-[#2563EB]"
              : "border-transparent text-[#71717A] hover:text-[#18181B]"
          }`}
        >
          <Play size={16} />
          MCP Tool Playground &amp; Katalog
        </button>

        <button
          onClick={() => setActiveTab("config")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "config"
              ? "border-[#2563EB] text-[#2563EB]"
              : "border-transparent text-[#71717A] hover:text-[#18181B]"
          }`}
        >
          <Terminal size={16} />
          Hubungkan AI Client (Claude, Cursor, Hermes)
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "audit"
              ? "border-[#2563EB] text-[#2563EB]"
              : "border-transparent text-[#71717A] hover:text-[#18181B]"
          }`}
        >
          <ShieldCheck size={16} />
          Audit Mutasi Agen ({auditLogs.length})
        </button>

        <button
          onClick={() => setActiveTab("resources")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "resources"
              ? "border-[#2563EB] text-[#2563EB]"
              : "border-transparent text-[#71717A] hover:text-[#18181B]"
          }`}
        >
          <Layers size={16} />
          Resources &amp; Prompts ({resources.length + prompts.length})
        </button>

        <button
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "logs"
              ? "border-[#2563EB] text-[#2563EB]"
              : "border-transparent text-[#71717A] hover:text-[#18181B]"
          }`}
        >
          <Clock size={16} />
          Log Pemanggilan AI ({logs.length})
        </button>
      </div>

      {/* TAB 1: TOOL PLAYGROUND */}
      {activeTab === "playground" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Tool List */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#18181B] flex items-center gap-2">
                <Zap size={16} className="text-[#2563EB]" />
                Daftar Tool MCP POS ({filteredTools.length}/{tools.length})
              </h3>
              <span className="text-xs text-[#71717A]">Pilih untuk menguji</span>
            </div>

            {/* Category Filter Chips */}
            <div className="flex flex-wrap gap-1.5 pb-1">
              {[
                { id: "all", label: `Semua (${tools.length})` },
                { id: "wa", label: "WhatsApp" },
                { id: "server", label: "Server Cluster" },
                { id: "promo", label: "Promo & Banner" },
                { id: "pos", label: "Kasir POS" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setToolCategory(cat.id)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                    toolCategory === cat.id
                      ? "bg-[#2563EB] text-white shadow-sm"
                      : "bg-[#F4F4F5] text-[#71717A] hover:bg-[#E4E4E7] hover:text-[#18181B]"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
              {filteredTools.map((t) => {
                const isSelected = selectedToolName === t.name;
                const domainInfo = getToolDomain(t.name);
                return (
                  <div
                    key={t.name}
                    onClick={() => handleSelectTool(t)}
                    className={`cursor-pointer rounded-xl border p-3.5 transition-all text-left ${
                      isSelected
                        ? "border-[#2563EB] bg-[#EFF6FF] shadow-sm"
                        : "border-[#E4E4E7] bg-white hover:border-[#CBD5E1]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <span className={`font-mono text-xs font-bold truncate ${isSelected ? "text-[#1D4ED8]" : "text-[#18181B]"}`}>
                        {t.name}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${domainInfo.color}`}>
                          {domainInfo.label}
                        </span>
                        {isSelected && <span className="text-[10px] bg-[#2563EB] text-white px-2 py-0.5 rounded-full font-bold">Dipilih</span>}
                      </div>
                    </div>
                    <p className="text-xs text-[#52525B] line-clamp-2 leading-relaxed">
                      {t.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Execution Playground */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white border border-[#E4E4E7] rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[#F4F4F5] pb-3">
                <div>
                  <h4 className="font-bold text-[#18181B] flex items-center gap-2">
                    <Play size={16} className="text-[#16A34A]" />
                    Playground: <span className="font-mono text-[#2563EB]">{selectedToolName}</span>
                  </h4>
                  <p className="text-xs text-[#71717A] mt-0.5">
                    Kirim request JSON-RPC langsung ke mesin MCP server dan pantau respons live.
                  </p>
                </div>
                <button
                  onClick={runTool}
                  disabled={executing}
                  className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-60"
                >
                  {executing ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                  Jalankan Tool
                </button>
              </div>

              {/* Arguments JSON Input */}
              <div>
                <label className="block text-xs font-bold text-[#52525B] mb-1.5 flex items-center justify-between">
                  <span>Argumen Input (JSON Schema Compliant):</span>
                  <span className="font-normal text-[11px] text-[#A1A1AA]">Sesuai inputSchema MCP</span>
                </label>
                <textarea
                  rows={5}
                  value={toolArgsText}
                  onChange={(e) => setToolArgsText(e.target.value)}
                  className="w-full font-mono text-xs p-3 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#2563EB] text-[#0F172A]"
                  placeholder='{\n  "date": "today"\n}'
                />
              </div>

              {/* Execution Result Box */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-[#52525B]">Hasil Eksekusi MCP Server:</span>
                  {executionResult?.latency_ms !== undefined && (
                    <span className="text-[11px] font-medium text-[#059669] bg-[#ECFDF5] px-2 py-0.5 rounded-full border border-[#A7F3D0]">
                      ⚡ Latensi: {executionResult.latency_ms} ms
                    </span>
                  )}
                </div>

                {executionResult ? (
                  <div className="relative">
                    <pre className="w-full font-mono text-xs p-3.5 rounded-xl border border-[#E2E8F0] bg-[#0F172A] text-[#38BDF8] max-h-80 overflow-y-auto whitespace-pre-wrap">
                      {JSON.stringify(executionResult.result || executionResult, null, 2)}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(executionResult.result, null, 2), "result")}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-[#1E293B] hover:bg-[#334155] text-white text-[11px] flex items-center gap-1"
                    >
                      {copiedKey === "result" ? <Check size={12} className="text-[#34D399]" /> : <Copy size={12} />}
                      Salin Hasil
                    </button>
                  </div>
                ) : (
                  <div className="border border-dashed border-[#CBD5E1] rounded-xl p-8 text-center text-xs text-[#94A3B8]">
                    Klik tombol <b>"Jalankan Tool"</b> di atas untuk mengeksekusi tool terpilih dan melihat payload data asli.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CLIENT CONFIGURATIONS */}
      {activeTab === "config" && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-lg text-[#18181B] flex items-center gap-2">
                <Terminal size={20} className="text-[#2563EB]" />
                Cara Menghubungkan Asisten AI ke MCP POS
              </h3>
              <p className="text-sm text-[#71717A] mt-1">
                Pilih aplikasi AI yang Anda gunakan di komputer kasir, laptop manager, atau server VPS Anda. Salin konfigurasi di bawah dan tempelkan pada file konfigurasi MCP masing-masing aplikasi.
              </p>
            </div>

            {/* Sub-tabs for clients */}
            <div className="flex border-b border-[#E4E4E7] gap-3">
              <button
                onClick={() => setSelectedClient("claude")}
                className={`py-2 px-3 text-xs font-bold border-b-2 transition-colors ${
                  selectedClient === "claude"
                    ? "border-[#2563EB] text-[#2563EB]"
                    : "border-transparent text-[#71717A] hover:text-[#18181B]"
                }`}
              >
                Claude Desktop (Mac / Windows)
              </button>

              <button
                onClick={() => setSelectedClient("cursor")}
                className={`py-2 px-3 text-xs font-bold border-b-2 transition-colors ${
                  selectedClient === "cursor"
                    ? "border-[#2563EB] text-[#2563EB]"
                    : "border-transparent text-[#71717A] hover:text-[#18181B]"
                }`}
              >
                Cursor / Windsurf IDE
              </button>

              <button
                onClick={() => setSelectedClient("hermes")}
                className={`py-2 px-3 text-xs font-bold border-b-2 transition-colors ${
                  selectedClient === "hermes"
                    ? "border-[#2563EB] text-[#2563EB]"
                    : "border-transparent text-[#71717A] hover:text-[#18181B]"
                }`}
              >
                Hermes Agent (VPS / WhatsApp)
              </button>

              <button
                onClick={() => setSelectedClient("curl")}
                className={`py-2 px-3 text-xs font-bold border-b-2 transition-colors ${
                  selectedClient === "curl"
                    ? "border-[#2563EB] text-[#2563EB]"
                    : "border-transparent text-[#71717A] hover:text-[#18181B]"
                }`}
              >
                cURL / HTTP Test
              </button>
            </div>

            {/* Content for selected client */}
            {selectedClient === "claude" && (
              <div className="space-y-3">
                <div className="p-3.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl text-xs text-[#1E40AF] space-y-1">
                  <div className="font-bold">Panduan Pemasangan Claude Desktop:</div>
                  <div>1. Buka Claude Desktop &rarr; Masuk ke <b>Settings &rarr; Developer &rarr; Edit Config</b>.</div>
                  <div>2. Salin konfigurasi di bawah dan tambahkan ke dalam blok <code>mcpServers</code> pada file <code>claude_desktop_config.json</code> Anda.</div>
                  <div>3. Restart Claude Desktop. Ikon palu (🔨) tools akan otomatis menampilkan 11 tools Grand Aceh POS!</div>
                </div>

                <div className="relative">
                  <pre className="w-full font-mono text-xs p-4 rounded-xl border border-[#E2E8F0] bg-[#0F172A] text-[#E2E8F0] overflow-x-auto whitespace-pre">
                    {claudeConfigSnippet}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(claudeConfigSnippet, "claude")}
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    {copiedKey === "claude" ? <Check size={14} /> : <Copy size={14} />}
                    Salin Konfigurasi
                  </button>
                </div>
              </div>
            )}

            {selectedClient === "cursor" && (
              <div className="space-y-3">
                <div className="p-3.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl text-xs text-[#166534] space-y-1">
                  <div className="font-bold">Panduan Pemasangan Cursor / Windsurf:</div>
                  <div>1. Buka <b>Cursor Settings &rarr; Features &rarr; MCP</b> (atau buat file <code>.cursor/mcp.json</code>).</div>
                  <div>2. Klik <b>Add New MCP Server</b>, pilih Type: <b>SSE</b>, dan masukkan URL: <code>{currentOrigin}/api/mcp/sse</code>.</div>
                  <div>3. Agen Cursor sekarang dapat mengaudit kode POS, memeriksa transaksi riil, dan menyinkronkan data.</div>
                </div>

                <div className="relative">
                  <pre className="w-full font-mono text-xs p-4 rounded-xl border border-[#E2E8F0] bg-[#0F172A] text-[#E2E8F0] overflow-x-auto whitespace-pre">
                    {cursorConfigSnippet}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(cursorConfigSnippet, "cursor")}
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    {copiedKey === "cursor" ? <Check size={14} /> : <Copy size={14} />}
                    Salin Konfigurasi
                  </button>
                </div>
              </div>
            )}

            {selectedClient === "hermes" && (
              <div className="space-y-3">
                <div className="p-3.5 bg-[#FEF3C7] border border-[#FDE68A] rounded-xl text-xs text-[#92400E] space-y-1">
                  <div className="font-bold">Panduan Pemasangan Hermes Agent:</div>
                  <div>1. Pada profil <code>business-analyst</code> di VPS Hermes Anda, aktifkan skill <code>mcp-pos-data-query</code>.</div>
                  <div>2. Arahkan endpoint SSE ke <code>{currentOrigin}/api/mcp/sse</code>.</div>
                  <div>3. Saat ada WhatsApp masuk meminta <i>"Berapa omzet hari ini?"</i> atau <i>"/stok"</i>, Hermes langsung query data real-time via MCP!</div>
                </div>

                <div className="relative">
                  <pre className="w-full font-mono text-xs p-4 rounded-xl border border-[#E2E8F0] bg-[#0F172A] text-[#E2E8F0] overflow-x-auto whitespace-pre">
                    {hermesConfigSnippet}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(hermesConfigSnippet, "hermes")}
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    {copiedKey === "hermes" ? <Check size={14} /> : <Copy size={14} />}
                    Salin Konfigurasi
                  </button>
                </div>
              </div>
            )}

            {selectedClient === "curl" && (
              <div className="space-y-3">
                <p className="text-xs text-[#52525B]">
                  Uji endpoint HTTP POST MCP langsung dari terminal bash / Linux / Windows PowerShell:
                </p>

                <div className="relative">
                  <pre className="w-full font-mono text-xs p-4 rounded-xl border border-[#E2E8F0] bg-[#0F172A] text-[#E2E8F0] overflow-x-auto whitespace-pre">
                    {curlTestSnippet}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(curlTestSnippet, "curl")}
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    {copiedKey === "curl" ? <Check size={14} /> : <Copy size={14} />}
                    Salin Perintah cURL
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: RESOURCES & PROMPTS */}
      {activeTab === "resources" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Resources Column */}
          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-5 shadow-sm space-y-4">
            <div className="border-b border-[#F4F4F5] pb-3">
              <h3 className="font-bold text-sm text-[#18181B] flex items-center gap-2">
                <Database size={16} className="text-[#059669]" />
                MCP Resources (Data Snapshots)
              </h3>
              <p className="text-xs text-[#71717A] mt-0.5">
                URI data read-only yang dapat dibaca kapan saja oleh model AI tanpa memicu perubahan status.
              </p>
            </div>

            <div className="space-y-2.5">
              {resources.map((r) => (
                <div key={r.uri} className="border border-[#E4E4E7] rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#059669]">{r.uri}</span>
                    <button
                      onClick={() => readSelectedResource(r.uri)}
                      disabled={readingResource}
                      className="px-2.5 py-1 bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#18181B] text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1"
                    >
                      <ArrowRight size={12} />
                      Baca Snapshot
                    </button>
                  </div>
                  <div className="text-xs font-bold text-[#18181B]">{r.name}</div>
                  <div className="text-xs text-[#71717A]">{r.description}</div>
                </div>
              ))}
            </div>

            {/* Resource viewer */}
            {resourceContent && (
              <div className="mt-4 pt-4 border-t border-[#F4F4F5] space-y-2">
                <div className="text-xs font-bold text-[#18181B] flex items-center justify-between">
                  <span>Isi Snapshot Resource ({readingUri}):</span>
                  <button
                    onClick={() => setResourceContent(null)}
                    className="text-[#EF4444] text-[11px] font-medium hover:underline"
                  >
                    Tutup
                  </button>
                </div>
                <pre className="font-mono text-xs p-3 rounded-xl border border-[#CBD5E1] bg-[#0F172A] text-[#4ADE80] max-h-60 overflow-y-auto whitespace-pre-wrap">
                  {JSON.stringify(resourceContent, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Prompts Column */}
          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-5 shadow-sm space-y-4">
            <div className="border-b border-[#F4F4F5] pb-3">
              <h3 className="font-bold text-sm text-[#18181B] flex items-center gap-2">
                <FileText size={16} className="text-[#D97706]" />
                MCP Prompts (System Presets)
              </h3>
              <p className="text-xs text-[#71717A] mt-0.5">
                Template prompt bawaan standar MCP untuk tugas audit dan analisis operasional restoran.
              </p>
            </div>

            <div className="space-y-3">
              {prompts.map((p) => (
                <div key={p.name} className="border border-[#E4E4E7] rounded-xl p-3.5 space-y-1.5">
                  <div className="font-mono text-xs font-bold text-[#B45309]">{p.name}</div>
                  <div className="text-xs text-[#52525B] leading-relaxed">{p.description}</div>
                  {p.arguments && p.arguments.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1.5">
                      {p.arguments.map((arg) => (
                        <span key={arg.name} className="px-2 py-0.5 bg-[#FEF3C7] text-[#92400E] text-[10px] rounded font-mono">
                          {arg.name} ({arg.required ? "wajib" : "opsional"})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: AUDIT MUTASI AGEN AI */}
      {activeTab === "audit" && (
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F4F4F5] pb-3">
            <div>
              <h3 className="font-bold text-sm text-[#18181B] flex items-center gap-2">
                <ShieldCheck size={18} className="text-[#2563EB]" />
                Audit Trail Mutasi Otomatis Agen AI ({auditLogs.length})
              </h3>
              <p className="text-xs text-[#71717A] mt-0.5">
                Setiap perubahan konfigurasi WhatsApp, Server Cluster, dan Promo oleh Hermes Agent langsung dicatat dengan snapshot sebelum dan sesudah mutasi.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadAll}
                className="px-3 py-1.5 text-xs text-[#71717A] hover:bg-[#F4F4F5] rounded-lg border border-[#E4E4E7] transition-colors font-medium flex items-center gap-1.5"
              >
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                Segarkan
              </button>
              {auditLogs.length > 0 && (
                <button
                  onClick={clearAuditLogs}
                  className="px-3 py-1.5 text-xs text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg border border-[#FCA5A5] transition-colors font-medium"
                >
                  Bersihkan Riwayat Audit
                </button>
              )}
            </div>
          </div>

          {/* Domain Filter Pills */}
          <div className="flex flex-wrap gap-1.5 pb-1">
            {[
              { id: "all", label: `Semua Domain (${auditLogs.length})` },
              { id: "wa", label: "WhatsApp Gateway" },
              { id: "server", label: "Server Cluster" },
              { id: "promo", label: "Promo & Banner" },
              { id: "pos", label: "Kasir POS" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setAuditDomainFilter(cat.id)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                  auditDomainFilter === cat.id
                    ? "bg-[#2563EB] text-white shadow-sm"
                    : "bg-[#F4F4F5] text-[#71717A] hover:bg-[#E4E4E7] hover:text-[#18181B]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {auditLogs.length > 0 ? (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {auditLogs
                .filter((item) => {
                  if (auditDomainFilter === "all") return true;
                  return item.domain === auditDomainFilter;
                })
                .map((log) => {
                  const isExpanded = expandedAuditId === log.id;
                  const domainBadge = {
                    wa: { label: "WhatsApp", color: "bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]" },
                    server: { label: "Cluster", color: "bg-[#F3E8FF] text-[#6B21A8] border-[#E9D5FF]" },
                    promo: { label: "Promo & Banner", color: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]" },
                    pos: { label: "POS Kasir", color: "bg-[#EFF6FF] text-[#1E40AF] border-[#BFDBFE]" },
                  }[log.domain] || { label: log.domain, color: "bg-[#F4F4F5] text-[#52525B] border-[#E4E4E7]" };

                  return (
                    <div
                      key={log.id}
                      className="border border-[#E4E4E7] rounded-xl p-4 bg-white hover:border-[#CBD5E1] transition-all space-y-3"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${domainBadge.color}`}>
                            {domainBadge.label}
                          </span>
                          <span className="font-mono text-xs font-bold text-[#18181B]">
                            {log.action}
                          </span>
                          <span className="text-[11px] text-[#71717A] bg-[#F4F4F5] px-2 py-0.5 rounded font-medium">
                            Aktor: <b>{log.agent || log.agent_id || log.actor || "hermes-agent"}</b>
                          </span>
                          {log.status === "error" ? (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#EF4444] text-white rounded">
                              ERROR
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#10B981] text-white rounded">
                              SUCCESS
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-[#A1A1AA]">
                            {new Date(log.timestamp).toLocaleString("id-ID", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                          <button
                            onClick={() => setExpandedAuditId(isExpanded ? null : log.id)}
                            className="flex items-center gap-1 text-[11px] font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
                          >
                            {isExpanded ? (
                              <>
                                Tutup Diff <ChevronUp size={13} />
                              </>
                            ) : (
                              <>
                                Bandingkan Diff <ChevronDown size={13} />
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="text-xs text-[#52525B] leading-relaxed bg-[#F8FAFC] p-2.5 rounded-lg border border-[#F1F5F9]">
                        {log.reason || log.summary || `Agen AI melakukan aksi ${log.action} pada domain ${log.domain}.`}
                      </div>

                      {/* Expandable Before / After Snapshot */}
                      {isExpanded && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-[#F1F5F9]">
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-[#DC2626] uppercase tracking-wider">
                              Snapshot Sebelum Mutasi:
                            </span>
                            <pre className="w-full font-mono text-[11px] p-2.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] max-h-48 overflow-y-auto whitespace-pre-wrap">
                              {JSON.stringify(log.before ?? log.before_state ?? {}, null, 2)}
                            </pre>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-[#16A34A] uppercase tracking-wider">
                              Snapshot Sesudah Mutasi:
                            </span>
                            <pre className="w-full font-mono text-[11px] p-2.5 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] max-h-48 overflow-y-auto whitespace-pre-wrap">
                              {JSON.stringify(log.after ?? log.after_state ?? {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#A1A1AA] border border-dashed border-[#E4E4E7] rounded-xl">
              Belum ada mutasi pengaturan yang dilakukan oleh Agen AI. Semua perubahan via MCP atau REST API akan tercatat otomatis di sini.
            </div>
          )}
        </div>
      )}

      {/* TAB 4: AUDIT LOGS */}
      {activeTab === "logs" && (
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#F4F4F5] pb-3">
            <div>
              <h3 className="font-bold text-sm text-[#18181B] flex items-center gap-2">
                <Clock size={16} className="text-[#71717A]" />
                Riwayat Pemanggilan MCP Tool oleh AI
              </h3>
              <p className="text-xs text-[#71717A] mt-0.5">
                Audit log interaksi real-time ketika Claude, Cursor, Hermes Agent, atau Asisten POS memanggil tool.
              </p>
            </div>
            {logs.length > 0 && (
              <button
                onClick={clearLogs}
                className="px-3 py-1.5 text-xs text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg border border-[#FCA5A5] transition-colors font-medium"
              >
                Bersihkan Log
              </button>
            )}
          </div>

          {logs.length > 0 ? (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`border rounded-xl p-3 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2 ${
                    log.is_error ? "border-[#FECACA] bg-[#FEF2F2]" : "border-[#E4E4E7] bg-white"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#2563EB]">{log.tool}</span>
                      <span className="text-[11px] text-[#A1A1AA]">({log.client || "Client"})</span>
                      {log.is_error && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold bg-[#EF4444] text-white rounded">
                          ERROR
                        </span>
                      )}
                    </div>
                    <div className="text-[#52525B] font-medium">{log.summary}</div>
                  </div>
                  <div className="text-[11px] text-[#A1A1AA] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#A1A1AA]">
              Belum ada riwayat pemanggilan tool MCP yang tercatat. Uji melalui tab Playground di atas!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
