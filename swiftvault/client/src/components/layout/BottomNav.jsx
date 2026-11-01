import { NavLink } from "react-router-dom";
import { Wallet2, LayoutDashboard, Send, History, User, ShieldCheck } from "lucide-react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/wallet", label: "Wallet", icon: Wallet2 },
  { to: "/transfer", label: "Transfer", icon: Send },
  { to: "/transactions", label: "History", icon: History },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/verification", label: "Verify", icon: ShieldCheck },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-borderc bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 lg:hidden">
      <div className="flex justify-around py-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                isActive ? "text-primary-600" : "text-gray-400"
              }`
            }
          >
            <Icon size={21} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
