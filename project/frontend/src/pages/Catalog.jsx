import { useState, useEffect, Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { Package, Boxes, Tags, Store, FlaskConical } from "lucide-react";

const Products = lazy(() => import("@/pages/Products"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const Categories = lazy(() => import("@/pages/Categories"));
const Vendors = lazy(() => import("@/pages/Vendors"));
const Recipes = lazy(() => import("@/pages/Recipes"));

const TABS = [
  { k: "produk", l: "Produk", i: Package, C: Products },
  { k: "stok", l: "Persediaan", i: Boxes, C: Inventory },
  { k: "kategori", l: "Kategori", i: Tags, C: Categories },
  { k: "vendor", l: "Vendor", i: Store, C: Vendors },
  { k: "resep", l: "Resep & HPP", i: FlaskConical, C: Recipes },
];

export default function Catalog() {
  const [params] = useSearchParams();
  const [t, setT] = useState(() => {
    const k = params.get("tab");
    if (TABS.some((x) => x.k === k)) return k;
    return "produk";
  });

  useEffect(() => {
    const k = params.get("tab");
    if (k && TABS.some((x) => x.k === k)) {
      setT(k);
    }
  }, [params]);

  const Active = (TABS.find((x) => x.k === t) || TABS[0]).C;
  return (
    <div className="h-full flex flex-col" data-testid="catalog-page">
      <div className="flex gap-1 p-2 border-b bg-white overflow-x-auto no-scrollbar" data-testid="catalog-tabs">
        {TABS.map((x) => (
          <button key={x.k} data-testid={`catalog-tab-${x.k}`} onClick={() => setT(x.k)}
            className={`tap flex items-center gap-2 px-4 h-10 rounded-lg font-bold text-sm whitespace-nowrap ${t === x.k ? "bg-[#E63946] text-white" : "text-[#52525B] hover:bg-[#F4F5F7]"}`}>
            <x.i size={16} /> {x.l}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-[#E63946] border-t-transparent rounded-full"></div></div>}>
          <Active />
        </Suspense>
      </div>
    </div>
  );
}
