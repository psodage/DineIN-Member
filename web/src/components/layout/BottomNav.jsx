import { Calendar, Home, Receipt, User, UtensilsCrossed } from "lucide-react";

const tabs = [
  { key: "snacks", label: "Snacks", icon: UtensilsCrossed },
  { key: "leaves", label: "Leaves", icon: Calendar },
  { key: "home",   label: "Home",   icon: Home },
  { key: "bill",   label: "Bill",   icon: Receipt },
  { key: "profile",label: "Profile",icon: User },
];

export default function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 px-3 pb-3">
      <div className="mx-auto flex max-w-lg items-center justify-between rounded-[24px] bg-white px-2 py-2 shadow-2xl shadow-slate-900/15 ring-1 ring-slate-100">
        {tabs.map(({ key, label, icon: Icon }) => {
          const active = key === activeTab;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onTabChange(key)}
              className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 transition-all"
              aria-label={label}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                  active
                    ? "bg-brand text-white shadow-md shadow-brand/40 scale-105"
                    : "text-slate-400"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              </div>
              <span
                className={`text-[10px] font-bold transition-colors ${
                  active ? "text-brand" : "text-slate-400"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
