import { NavLink } from "react-router-dom";
import { Wallet2, LayoutDashboard, Send, History, User, ShieldCheck, LifeBuoy } from "lucide-react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/wallet", label: "Wallet", icon: Wallet2 },
  { to: "/transfer", label: "Transfer", icon: Send },
  { to: "/transactions", label: "History", icon: History },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/verification", label: "Verification", icon: ShieldCheck },
  { to: "/support", label: "Help & support", icon: LifeBuoy },
];

export default function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-borderc bg-white dark:border-gray-800 dark:bg-gray-900 lg:flex lg:flex-col">
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary">
          <Wallet2 size={18} className="text-white" />
        </div>
        <span className="text-lg font-bold text-text-primary dark:text-gray-100">SwiftVault</span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                  : "text-text-secondary hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
              }`
            }
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
