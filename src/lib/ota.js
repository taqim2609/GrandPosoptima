import { toast } from "sonner";
import { getServerUrl } from "./api";
// Static imports — dynamic import() tidak didukung WebView Android 7 (Chrome <63)
// -> "Unexpected token import". Plugin ini aman di-import di web (tidak dipakai bila bukan native).
import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";

// Kirim status OTA ke UI (komponen OtaIndicator mendengarkan event ini).
function emitOta(show, percent) {
  try { window.dispatchEvent(new CustomEvent("gak-ota-status", { detail: { show, percent } })); } catch (e) {}
}

// Versi yang tertanam di bundle APK saat ini (dilayani lokal di ./ota/version.json).
async function localBundleVersion() {
  try {
    const r = await fetch("ota/version.json", { cache: "no-store" });
    if (r.ok) { const j = await r.json(); return j.version || ""; }
  } catch (e) {}
  return "";
}

/**
 * OTA update via server Pi (LAN). Hanya berjalan di APK (native), diabaikan di web/PWA.
 * Cek /ota/version.json di server; jika versi lebih baru, unduh bundle dari Pi & pasang live.
 * Mengembalikan hasil {status, reason, serverVersion, installedVersion} untuk ditampilkan di UI.
 * status: "updated" | "up-to-date" | "error" | "not-native" | "no-server" | "no-update"
 */
export async function checkOtaUpdate({ silent = false } = {}) {
  // Tampilkan notifikasi sekali setelah aplikasi reload akibat OTA berhasil.
  try {
    if (localStorage.getItem("gak_ota_just_updated")) {
      localStorage.removeItem("gak_ota_just_updated");
      toast.success("Tampilan diperbarui ke versi terbaru", { duration: 5000 });
    }
  } catch (e) {}

  try {
    if (!Capacitor?.isNativePlatform?.()) return { status: "not-native" };
    await CapacitorUpdater.notifyAppReady();
  } catch {
    return { status: "not-native" }; // bukan native / plugin tak tersedia
  }
  try {
    const base = getServerUrl();
    // Prioritaskan server aktif, lalu fallback ke node alternatif (Pi LAN & VPS Tailscale)
    const candidates = [
      base,
      "http://pos.local:3000",
      "http://100.117.186.13:8000",
      "",
    ].filter((v, i, a) => a.indexOf(v) === i && (v !== null && v !== undefined));

    let res = null;
    let activeBase = base || "";
    for (const cand of candidates) {
      try {
        const urlToTry = cand ? `${cand.replace(/\/+$/, "")}/api/ota/version` : "/api/ota/version";
        res = await fetch(urlToTry, { cache: "no-store", signal: AbortSignal.timeout(3000) });
        if (res && res.ok) {
          activeBase = cand;
          break;
        }
      } catch (_) {}
      try {
        const urlToTry = cand ? `${cand.replace(/\/+$/, "")}/ota/version.json` : "/ota/version.json";
        res = await fetch(urlToTry, { cache: "no-store", signal: AbortSignal.timeout(3000) });
        if (res && res.ok) {
          activeBase = cand;
          break;
        }
      } catch (_) {}
    }

    if (!res || !res.ok) return { status: "error", reason: `Server balas HTTP ${res ? res.status : "offline"}` };
    const { version, url } = await res.json();
    if (!version) return { status: "error", reason: "version server kosong" };
    // Versi bundle yang BENAR-BENAR aktif: dari plugin Capgo (paling akurat).
    let current = "";
    try {
      const cur = await CapacitorUpdater.current();
      current = (cur && cur.version) || "";
    } catch (_) {}
    if (!current) current = localStorage.getItem("gak_ota_version") || "";
    if (!current) current = await localBundleVersion(); // seed dari versi bundle bawaan APK
    // Hanya update bila server BENAR-BENAR lebih baru. Mencegah APK baru menarik
    // bundle LAMA dari Pi (yang belum di-update) yang menyebabkan layar blank.
    if (current && version <= current) {
      if (!localStorage.getItem("gak_ota_version")) localStorage.setItem("gak_ota_version", current);
      if (!silent) toast.info(`Sudah versi terbaru (OTA ${current})`, { duration: 5000 });
      return { status: "up-to-date", serverVersion: version, installedVersion: current };
    }
    const full = url?.startsWith("http") ? url : `${activeBase}${url || "/ota/bundle.zip"}`;
    emitOta(true, 0); // tampilkan indikator + progres
    let dlListener;
    try {
      dlListener = await CapacitorUpdater.addListener("download", (s) => emitOta(true, Math.round(s?.percent || 0)));
    } catch (e) {}
    const bundle = await CapacitorUpdater.download({ url: full, version });
    try { if (dlListener) dlListener.remove(); } catch (e) {}
    emitOta(true, 100);
    localStorage.setItem("gak_ota_version", version);
    // Tandai agar setelah reload muncul toast "Tampilan diperbarui".
    try { localStorage.setItem("gak_ota_just_updated", version); } catch (e) {}
    if (!silent) toast.success(`Update OTA ${version} diunduh — menerapkan...`, { duration: 5000 });
    await CapacitorUpdater.set(bundle); // beralih ke bundle baru & reload
    return { status: "updated", serverVersion: version, installedVersion: current };
  } catch (e) {
    emitOta(false); // sembunyikan indikator bila gagal/offline
    if (!silent) toast.error(`Update OTA gagal: ${(e && e.message) || e}`, { duration: 6000 });
    return { status: "error", reason: (e && e.message) || String(e) };
  }
}
