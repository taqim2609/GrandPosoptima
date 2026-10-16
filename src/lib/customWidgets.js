/* ================================================================
   WIDGET KUSTOM DASHBOARD — pustaka bersama (Dashboard & Pengaturan)
   Widget = angka hasil dari RUMUS sederhana yang menggabungkan:
     • isian SENDIRI  : nilai tetap (fixed) & isian harian per tanggal
     • data OTOMATIS  : laporan aplikasi untuk tanggal yang dipilih
   Rumus aman: angka + kode variabel + operator + - * / % ( )
   ================================================================ */

// ---- Variabel otomatis yang bisa dipakai di rumus (dari /reports/summary) ----
export const AUTO_VARS = [
  { code: "penjualan_total", label: "Total penjualan (F&B + Retail)", hint: "Rp", pick: (s) => s?.total_sales },
  { code: "penjualan_fnb", label: "Penjualan F&B (dine-in + take-away)", hint: "Rp", pick: (s) => s?.fnb_total },
  { code: "penjualan_retail", label: "Penjualan Retail", hint: "Rp", pick: (s) => s?.retail_total },
  { code: "penjualan_dinein", label: "Penjualan dine-in", hint: "Rp", pick: (s) => s?.by_type?.dine_in?.total },
  { code: "penjualan_takeaway", label: "Penjualan take-away", hint: "Rp", pick: (s) => s?.by_type?.take_away?.total },
  { code: "laba_fnb", label: "Laba kotor F&B (setelah HPP & bagian vendor)", hint: "Rp", pick: (s) => s?.gross_profit_fnb },
  { code: "laba_retail", label: "Laba kotor Retail", hint: "Rp", pick: (s) => s?.gross_profit_retail },
  { code: "laba_total", label: "Laba kotor total (F&B + Retail)", hint: "Rp", pick: (s) => s?.gross_profit },
  { code: "kas_bersih_fnb", label: "Kas bersih laci F&B (tunai − pengeluaran)", hint: "Rp", pick: (s) => s?.cash_net_fnb },
  { code: "kas_bersih_retail", label: "Kas bersih laci Retail", hint: "Rp", pick: (s) => s?.cash_net_retail },
  { code: "kas_bersih_total", label: "Kas bersih laci total", hint: "Rp", pick: (s) => s?.cash_net },
  { code: "kas_tunai_fnb", label: "Pembayaran tunai F&B", hint: "Rp", pick: (s) => s?.cash_sales_fnb },
  { code: "kas_tunai_retail", label: "Pembayaran tunai Retail", hint: "Rp", pick: (s) => s?.cash_sales_retail },
  { code: "kas_keluar_fnb", label: "Pengeluaran F&B hari ini", hint: "Rp", pick: (s) => s?.cash_out_fnb },
  { code: "kas_keluar_retail", label: "Pengeluaran Retail hari ini", hint: "Rp", pick: (s) => s?.cash_out_retail },
  { code: "order_total", label: "Jumlah order lunas (semua)", hint: "order", pick: (s) => s?.order_count },
  { code: "order_dinein", label: "Jumlah order dine-in", hint: "order", pick: (s) => s?.by_type?.dine_in?.count },
  { code: "order_takeaway", label: "Jumlah order take-away", hint: "order", pick: (s) => s?.by_type?.take_away?.count },
  { code: "order_retail", label: "Jumlah order retail", hint: "order", pick: (s) => s?.by_type?.retail?.count },
  { code: "diskon_total", label: "Total diskon yang diberikan", hint: "Rp", pick: (s) => s?.total_discount },
];

export const AUTO_VAR_MAP = Object.fromEntries(AUTO_VARS.map((v) => [v.code, v]));
export const AUTO_KEYS = new Set(AUTO_VARS.map((v) => v.code));

export const CW_FORMATS = [
  { key: "rupiah", label: "Rupiah (Rp)", icon: "Rp" },
  { key: "jumlah", label: "Jumlah", icon: "#" },
  { key: "persen", label: "Persen (%)", icon: "%" },
  { key: "angka", label: "Angka", icon: "=" },
];

export const CW_COLORS = ["#E63946", "#0EA5E9", "#047857", "#0D9488", "#B45309", "#7C3AED", "#4F46E5", "#DB2777", "#0A0A0A", "#1D4ED8"];

const RE_NUM = /^\d+(\.\d+)?$/;
const RE_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function tokenizeFormula(expr) {
  const bad = String(expr || "").replace(/[\sA-Za-z0-9_()+\-*/%.]/g, "");
  if (bad) return { error: `Karakter tidak dikenal: "${bad.slice(0, 6)}"` };
  const toks = String(expr).match(/\d+\.?\d*|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/%]/g) || [];
  if (!toks.length) return { error: "Rumus kosong" };
  return { toks };
}

// Shunting-yard → postfix (RPN). allowed = set kode isian milik widget.
export function toRpn(tokens, allowed) {
  const out = [];
  const ops = [];
  const err = (m) => { throw new Error(m); };
  for (const t of tokens) {
    if (RE_NUM.test(t)) out.push(["n", parseFloat(t)]);
    else if (RE_ID.test(t)) {
      if (!allowed.has(t)) err(`Variabel "${t}" tidak dikenal — pakai kode isian atau variabel otomatis`);
      out.push(["v", t]);
    } else if (t === "+" || t === "-" || t === "*" || t === "/" || t === "%") {
      const prec = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2 };
      while (ops.length && ops[ops.length - 1] !== "(" && prec[ops[ops.length - 1]] >= prec[t]) out.push(["o", ops.pop()]);
      ops.push(t);
    } else if (t === "(") ops.push(t);
    else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(["o", ops.pop()]);
      if (!ops.length || ops[ops.length - 1] !== "(") err("Kurung tidak seimbang");
      ops.pop();
    }
  }
  while (ops.length) {
    if (ops[ops.length - 1] === "(") err("Kurung tidak seimbang");
    out.push(["o", ops.pop()]);
  }
  return out;
}

export function evalRpn(rpn, env) {
  const st = [];
  for (const [k, v] of rpn) {
    if (k === "n") st.push(v);
    else if (k === "v") st.push(Number(env[v] ?? 0) || 0);
    else {
      if (st.length < 2) throw new Error("Rumus tidak valid");
      const b = st.pop();
      const a = st.pop();
      if (v === "+") st.push(a + b);
      else if (v === "-") st.push(a - b);
      else if (v === "*") st.push(a * b);
      else if (v === "/") { if (b === 0) throw new Error("Pembagian dengan nol"); st.push(a / b); }
      else if (v === "%") { if (b === 0) throw new Error("Pembagian dengan nol (%)"); st.push(a % b); }
    }
  }
  return st.length ? st[st.length - 1] : 0;
}

/** Validasi rumus. Returns {ok, rpn, refs, error} */
export function validateFormula(formula, fieldCodes) {
  const allowed = new Set(fieldCodes);
  AUTO_KEYS.forEach((k) => allowed.add(k));
  const tok = tokenizeFormula(formula);
  if (tok.error) return { ok: false, error: tok.error };
  try {
    const rpn = toRpn(tok.toks, allowed);
    const refs = [...new Set(rpn.filter(([k]) => k === "v").map(([, v]) => v))].sort();
    return { ok: true, rpn, refs };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Lingkungan nilai untuk evaluasi: kode isian + variabel otomatis (summary). */
export function buildEnv(fields, dailyValues, summary) {
  const env = {};
  for (const f of fields || []) {
    const v = f.kind === "fixed" ? Number(f.value ?? 0) : Number(dailyValues?.[f.code] ?? 0);
    env[f.code] = isFinite(v) ? v : 0;
  }
  for (const av of AUTO_VARS) {
    const v = av.pick(summary);
    env[av.code] = isFinite(Number(v)) ? Number(v) : 0;
  }
  return env;
}

/** Hasilkan kode isian otomatis dari label (aman dipakai di rumus). */
export function slugCode(label) {
  const base = String(label || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
  const out = base || "isi";
  return /^[0-9]/.test(out) ? "v_" + out : out;
}

/** Format angka ala Indonesia (pemisah ribuan, maks 2 desimal). */
export function numID(n) {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return v.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/** Format hasil sesuai format widget. */
export function formatValue(widget, n) {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  if (widget?.format === "rupiah") return "Rp" + Math.round(v).toLocaleString("id-ID");
  if (widget?.format === "persen") return v.toLocaleString("id-ID", { maximumFractionDigits: 2 }) + "%";
  if (widget?.format === "jumlah") return Math.round(v).toLocaleString("id-ID");
  return numID(v);
}

/** Rumus → teks terbaca manusia (kode diganti label). */
export function formulaLabeled(formula, codeLabel) {
  const tok = tokenizeFormula(formula);
  if (tok.error) return formula;
  return tok.toks
    .map((t) => {
      if (RE_ID.test(t) && !RE_NUM.test(t)) return `[${codeLabel(t) || t}]`;
      return t === "*" ? "×" : t;
    })
    .join(" ");
}

/** Label untuk kode apapun (isian widget dulu, lalu variabel otomatis). */
export function codeLabel(def, code) {
  const f = (def?.fields || []).find((x) => x.code === code);
  if (f) return f.label;
  return AUTO_VAR_MAP[code]?.label || code;
}

export const CW_FIELD_KIND_LABEL = { daily: "Isian Harian", fixed: "Nilai Tetap" };

export function newWidgetTemplate() {
  return {
    name: "",
    desc: "",
    format: "rupiah",
    color: "#E63946",
    enabled: true,
    fields: [
      { label: "", kind: "daily", code: "", value: 0 },
    ],
    formula: "",
  };
}

export const CW_FORMULA_HELP = [
  "Tulis rumus dengan kode isian & variabel otomatis, mis. penjualan_total - kas_keluar_fnb - gaji - listrik",
  "Operator: + (tambah), − (kurang), × pakai *, ÷ pakai /, % (sisa bagi), dan kurung ( ).",
  "Variabel otomatis berisi data laporan pada tanggal yang sama dengan isian harian.",
  "Angka desimal boleh (contoh 0.1 untuk 10%).",
];
