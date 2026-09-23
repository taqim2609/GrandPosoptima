import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

// Safely remove the initial 'gak-init-loader' overlay once React finishes hydration/mounting
function removeGakInitLoader() {
  const loader = document.getElementById("gak-init-loader");
  if (loader) {
    loader.style.transition = "opacity 0.25s ease-out, visibility 0.25s ease-out";
    loader.style.opacity = "0";
    loader.style.pointerEvents = "none";
    setTimeout(() => {
      try {
        if (loader.parentNode) {
          loader.parentNode.removeChild(loader);
        }
      } catch (e) {
        // ignore
      }
    }, 300);
  }
}

if (typeof window !== "undefined") {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      setTimeout(removeGakInitLoader, 50);
    });
  } else {
    setTimeout(removeGakInitLoader, 50);
  }
}

// Service worker HANYA untuk versi web (PWA). Di APK Android (Capacitor) service worker
// BERKONFLIK dengan update OTA (Capgo): SW menyajikan index/JS lama dari cache setelah
// bundle diganti -> layar putih. Di APK, ketahanan offline sudah ditangani localStorage,
// jadi SW dimatikan & cache lama dibersihkan agar OTA berjalan mulus.
const IS_NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform());

if (IS_NATIVE) {
  // Bersihkan sisa service worker / cache dari instalasi lama (pemulihan dari blank).
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
  }
  if (typeof caches !== "undefined") {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  }
} else if ("serviceWorker" in navigator) {
  // Web / PWA: tetap pakai service worker untuk ketahanan offline app-shell.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
