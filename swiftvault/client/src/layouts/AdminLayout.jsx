import { Outlet, useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import Header from "../components/layout/Header.jsx";
import Dropdown from "../components/ui/Dropdown.jsx";
import {
  LayoutDashboard, Users, Receipt, Settings2, Wallet, FileBarChart, Bell, Cog, ClipboardList, ShieldCheck, Webhook, ClipboardCheck, LifeBuoy, Gift,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
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
];

export default function AdminLayout() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-surface dark:bg-gray-950">
      <AdminSidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <div className="flex items-center border-b border-borderc bg-white px-4 py-2 dark:border-gray-800 dark:bg-gray-900 lg:hidden">
          <Dropdown
            align="left"
            trigger={
              <button aria-label="Admin menu" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                <Menu size={20} />
              </button>
            }
            items={NAV_ITEMS.map((item) => ({ label: item.label, icon: item.icon, onClick: () => navigate(item.to) }))}
          />
          <span className="ml-2 font-bold text-text-primary dark:text-gray-100">Admin Panel</span>
        </div>
        <Header />
        <main className="flex-1 pb-6">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
