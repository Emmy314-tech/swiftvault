import { useNavigate } from "react-router-dom";
import { Wallet2, Send, Smartphone, Wifi, Tv, Zap, Trophy, GraduationCap, Printer, LayoutGrid } from "lucide-react";
import { useToast } from "../../context/ToastContext.jsx";

const ACTIONS = [
  { label: "Fund Wallet", icon: Wallet2, to: "/wallet" },
  { label: "Transfer", icon: Send, to: "/transfer" },
  { label: "Airtime", icon: Smartphone, to: "/vtu/airtime" },
  { label: "Data", icon: Wifi, to: "/vtu/data" },
  { label: "Cable TV", icon: Tv, to: "/vtu/cable" },
  { label: "Electricity", icon: Zap, to: "/vtu/electricity" },
  { label: "Betting", icon: Trophy, to: "/vtu/betting" },
  { label: "Education", icon: GraduationCap, to: "/vtu/education" },
  { label: "Recharge Card", icon: Printer, to: "/vtu/recharge-card" },
  { label: "More Services", icon: LayoutGrid, to: "/vtu" },
];

// All VTU routes are now built except Betting, which has its own honest placeholder screen
const AVAILABLE_ROUTES = ["/wallet", "/transfer", "/vtu", "/vtu/airtime", "/vtu/data", "/vtu/cable", "/vtu/electricity", "/vtu/betting", "/vtu/education", "/vtu/recharge-card"];

export default function QuickActions() {
  const navigate = useNavigate();
  const toast = useToast();

  const handleClick = (to) => {
    if (AVAILABLE_ROUTES.includes(to)) navigate(to);
    else toast("This service is coming in the next update", "info");
  };

  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-10">
      {ACTIONS.map(({ label, icon: Icon, to }) => (
        <button
          key={label}
          onClick={() => handleClick(to)}
          className="flex flex-col items-center gap-1.5 rounded-2xl p-2 text-center transition hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
            <Icon size={20} />
          </div>
          <span className="text-[11px] font-medium leading-tight text-text-secondary dark:text-gray-400">
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}
