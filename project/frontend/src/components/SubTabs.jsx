/* Sub-tab generik (dipakai Pengaturan/Pengguna, Platform, Fitur, Produk, Promo).
   items: [{key, label, icon?}] ; children = komponen halaman yang dirender. */
import { useState, Suspense, isValidElement } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function SubTabs({ items = [], initial, testid = "subtab", className = "" }) {
  const [t, setT] = useState(initial || items[0]?.key);
  const currentItem = items.find((x) => x.key === t) || items[0];
  const Active = currentItem?.comp;
  return (
    <div className={`h-full flex flex-col ${className}`} data-testid={testid}>
      <div className="flex gap-1.5 px-6 pt-4 pb-3 border-b bg-white overflow-x-auto no-scrollbar">
        {items.map((x) => (
          <button key={x.key} data-testid={`${testid}-${x.key}`} onClick={() => setT(x.key)}
            className={`tap flex items-center gap-2 px-4 h-10 rounded-xl font-bold text-sm whitespace-nowrap ${
              t === x.key ? "bg-[#E63946] text-white" : "bg-[#F4F5F7] text-[#52525B] hover:bg-[#E4E4E7]"
            }`}>
            {x.icon ? <x.icon size={16} /> : null} {x.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        <ErrorBoundary key={t}>
          <Suspense fallback={<div className="flex h-full items-center justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-[#E63946] border-t-transparent rounded-full"></div></div>}>
            {isValidElement(Active) ? Active : (Active ? <Active /> : null)}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
