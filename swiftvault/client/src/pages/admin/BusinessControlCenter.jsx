import { Link } from "react-router-dom";
import { DollarSign, ToggleLeft, Landmark, Key, Crown, ChevronRight } from "lucide-react";
import Card from "../../components/ui/Card.jsx";

const SECTIONS = [
  { label: "Dynamic Pricing", description: "VTU markups by service and tier", icon: DollarSign, to: "/admin/business-control/pricing" },
  { label: "Service Enable/Disable", description: "Turn services on or off platform-wide", icon: ToggleLeft, to: "/admin/business-control/services" },
  { label: "Company Bank Accounts", description: "Manage accounts shown for manual funding", icon: Landmark, to: "/admin/business-control/bank-accounts" },
  { label: "API Credentials", description: "Paystack, Peyflex, and Termii keys", icon: Key, to: "/admin/business-control/credentials" },
  { label: "Membership & Referral Settings", description: "Upgrade fees and commission rates", icon: Crown, to: "/admin/business-control/membership" },
];

export default function BusinessControlCenter() {
  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Business Control Center</h1>

      <div className="space-y-3">
        {SECTIONS.map(({ label, description, icon: Icon, to }) => (
          <Link key={to} to={to}>
            <Card className="flex items-center gap-4 transition hover:shadow-md">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                <Icon size={20} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-text-primary dark:text-gray-100">{label}</p>
                <p className="text-xs text-text-secondary dark:text-gray-400">{description}</p>
              </div>
              <ChevronRight size={18} className="text-gray-300" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
