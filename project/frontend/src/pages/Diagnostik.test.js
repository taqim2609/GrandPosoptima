/**
 * Regresi: banner status di pages/Diagnostik.jsx harus bisa dirender pada
 * setiap cabang score, termasuk cabang 80..99 yang memakai `AlertTriangle`.
 *
 * Kenapa test ini ada: `craco build` (babel) tidak me-resolve nama identifier,
 * dan `eslint.undef.config.cjs` hanya mengaktifkan `no-undef` yang juga tidak
 * memeriksa komponen JSX. Akibatnya komponen lucide yang lupa di-import
 * (kasus nyata: `AlertTriangle` pada skor 80..99) lolos build dan lolos
 * check:undef, lalu melempar ReferenceError saat halaman dibuka.
 *
 * Pemeriksaan statis: `eslint.jsx.config.cjs` (react/jsx-no-undef).
 * Berkas ini bukti EKSEKUSI: halaman dirender ke DOM (jsdom), diagnosa
 * dijalankan sampai selesai, dan cabang banner 80..99 benar-benar dievaluasi.
 *
 * Catatan: berkas ini .js, preset JSX CRA tidak berlaku untuk .js di jest,
 * jadi elemen ditulis lewat `React.createElement`.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import Diagnostik from "./Diagnostik";

const h = React.createElement;

jest.mock("sonner", () => {
  const t = jest.fn();
  t.loading = jest.fn(() => "id");
  t.success = jest.fn();
  t.error = jest.fn();
  return { toast: t };
});

jest.mock("@/lib/diag", () => ({
  buildDiagReport: jest.fn(() => Promise.resolve("")),
  installDiag: jest.fn(),
  errorLog: [],
}));

jest.mock("@/lib/utils", () => ({
  copyText: jest.fn(() => Promise.resolve(true)),
  cn: (...a) => a.filter(Boolean).join(" "),
}));

const REAL_TIMEOUT = global.setTimeout;

beforeAll(() => {
  // runDiagnostics memakai `await delay(ms)`; nolkan supaya test cepat.
  global.setTimeout = (fn, _ms, ...rest) => REAL_TIMEOUT(fn, 0, ...rest);
});

afterAll(() => {
  global.setTimeout = REAL_TIMEOUT;
});

/**
 * Server "sehat" untuk semua endpoint, TANPA Capacitor dan TANPA token kasir.
 * Hasilnya: internet/server/database/queue success, tetapi
 *   - printer -> warning  (browser biasa, bukan APK Sunmi)
 *   - auth    -> warning  (token login tidak ada)
 * Skor = 100 - 5 - 5 = 90, tepat di cabang 80..99 yang memakai AlertTriangle.
 */
const healthyFetch = () =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        ok: true,
        latency_ms: 12,
        status: "healthy",
        version: "2.10",
        database_sync: { total_records: { products: 10, orders: 20 } },
        name: "Kasir",
        role: "kasir",
      }),
  });

async function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(h(Diagnostik));
  });
  await act(async () => {
    await new Promise((r) => REAL_TIMEOUT(r, 100));
  });

  const banner = container.querySelector('[data-testid="score-banner"]');
  const text = banner ? banner.textContent : "";
  const svg = banner ? banner.querySelector("svg") : null;

  await act(async () => {
    root.unmount();
  });
  container.remove();

  return { text: text || "", hasIcon: !!svg };
}

describe("Diagnostik — banner status", () => {
  beforeEach(() => {
    global.fetch = jest.fn(healthyFetch);
    localStorage.clear();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("skor 80..99 merender banner perhatian + ikon, tanpa ReferenceError", async () => {
    const { text, hasIcon } = await renderPage();

    // Bila import AlertTriangle hilang, render melempar ReferenceError di sini.
    expect(text).toContain("Beberapa Fitur Memerlukan Perhatian");
    expect(text).not.toContain("Sistem Mengalami Gangguan Kritis");
    expect(hasIcon).toBe(true);
  });
});
