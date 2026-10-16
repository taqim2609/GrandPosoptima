import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tag, Ticket } from "lucide-react";
import Promos from "@/pages/Promos";
import Coupons from "@/pages/Coupons";

/* Promo & Kupon digabung dalam satu menu (sub-tab). */
export default function PromosCoupons() {
  const [params] = useSearchParams();
  const [t, setT] = useState(params.get("tab") === "kupon" ? "kupon" : "promo");
  useEffect(() => {
    const k = params.get("tab");
    if (k === "kupon" || k === "promo") setT(k);
  }, [params]);
  const items = [
    { key: "promo", label: "Promo", icon: Tag, comp: Promos },
    { key: "kupon", label: "Kupon", icon: Ticket, comp: Coupons },
  ];
  const Active = (items.find((x) => x.key === t) || items[0]).comp;
  return (
    <div className="h-full flex flex-col" data-testid="promo-coupon-page">
      <div className="flex gap-1.5 px-6 pt-4 pb-3 border-b bg-white" data-testid="pc-tabs">
        {items.map((x) => (
          <button key={x.key} data-testid={`pc-tab-${x.key}`} onClick={() => setT(x.key)}
            className={`tap flex items-center gap-2 px-4 h-10 rounded-xl font-bold text-sm ${t === x.key ? "bg-[#E63946] text-white" : "bg-[#F4F5F7] text-[#52525B] hover:bg-[#E4E4E7]"}`}>
            <x.icon size={16} /> {x.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        <Active />
      </div>
    </div>
  );
}
