import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, Receipt, Settings2, Wallet2, ClipboardCheck,
  FileBarChart, Bell, Cog, Wallet, ClipboardList, KeyRound, ShieldCheck, Webhook, LifeBuoy, Gift,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/kyc", label: "KYC & Policy", icon: ShieldCheck },
  { to: "/admin/transactions", label: "Transactions", icon: Receipt },
  { to: "/admin/reconciliation", label: "Reconciliation", icon: ClipboardCheck },
  { to: "/admin/business-control", label: "Business Control", icon: Settings2 },
  { to: "/admin/company-wallet", label: "Company Wallet", icon: Wallet },
  { to: "/admin/promotional-reserve", label: "Promotional Reserve", icon: Gift },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart },
  { to: "/admin/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/activity-log", label: "Activity Log", icon: ClipboardList },
  { to: "/admin/financial-audit", label: "Financial Audit", icon: ShieldCheck },
  { to: "/admin/webhook-logs", label: "Webhook Logs", icon: Webhook },
  { to: "/admin/support", label: "Support", icon: LifeBuoy },
  { to: "/admin/system-settings", label: "System Settings", icon: Cog },
  { to: "/admin/pin-setup", label: "Admin PIN", icon: KeyRound },
];

export default function AdminSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-borderc bg-white dark:border-gray-800 dark:bg-gray-900 lg:flex lg:flex-col">
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary">
          <Wallet2 size={18} className="text-white" />
        </div>
        <div>
          <span className="text-base font-bold text-text-primary dark:text-gray-100">SwiftVault</span>
          <p className="text-[10px] font-medium uppercase tracking-wide text-primary-600">Admin</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
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
