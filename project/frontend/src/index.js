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

// Unregister service worker completely (complying with Golden Rule #2: avoid cache conflicts with OTA and new builds)
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
  if (typeof caches !== "undefined") {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  }
}

// Global auto-reload recovery for ChunkLoadError (stale JS chunk after new deployment)
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    const msg = event?.message || event?.error?.message || "";
    if (msg.includes("ChunkLoadError") || msg.includes("Loading chunk")) {
      const reloaded = sessionStorage.getItem("gak_chunk_error_reloaded");
      if (!reloaded) {
        sessionStorage.setItem("gak_chunk_error_reloaded", "true");
        window.location.reload();
      }
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const msg = event?.reason?.message || String(event?.reason || "");
    if (msg.includes("ChunkLoadError") || msg.includes("Loading chunk")) {
      const reloaded = sessionStorage.getItem("gak_chunk_error_reloaded");
      if (!reloaded) {
        sessionStorage.setItem("gak_chunk_error_reloaded", "true");
        window.location.reload();
      }
    }
  });
}
