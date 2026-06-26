import { Calendar, Home, Receipt, User, UtensilsCrossed } from "lucide-react";

const tabs = [
  { key: "snacks",  label: "Snacks",  icon: UtensilsCrossed },
  { key: "leaves",  label: "Leaves",  icon: Calendar },
  { key: "home",    label: "Home",    icon: Home },
  { key: "bill",    label: "Bill",    icon: Receipt },
  { key: "profile", label: "Profile", icon: User },
];

export default function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 bg-white shadow-[0_-1px_0_0_#f1f5f9] ring-0">
      <div className="mx-auto flex max-w-lg items-center justify-between px-2 py-1.5">
        {tabs.map(({ key, label, icon: Icon }) => {
          const active = key === activeTab;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onTabChange(key)}
              className="flex flex-1 flex-col items-center gap-1 py-1.5 transition-all"
              aria-label={label}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                  active
                    ? "scale-105 text-white shadow-md shadow-orange-400/40"
                    : "text-slate-400"
                }`}
                style={active ? { background: "linear-gradient(135deg,#FB923C,#9A3412)" } : {}}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              </div>
              <span
                className={`text-[10px] font-bold transition-colors ${
                  active ? "text-accent" : "text-slate-400"
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
