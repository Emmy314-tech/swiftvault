import { Link } from "react-router-dom";
import { Smartphone, Wifi, Tv, Zap, Trophy, GraduationCap, Printer, ArrowLeft } from "lucide-react";
import Card from "../../components/ui/Card.jsx";

const SERVICES = [
  { label: "Airtime", icon: Smartphone, to: "/vtu/airtime" },
  { label: "Data", icon: Wifi, to: "/vtu/data" },
  { label: "Cable TV", icon: Tv, to: "/vtu/cable" },
  { label: "Electricity", icon: Zap, to: "/vtu/electricity" },
  { label: "Betting", icon: Trophy, to: "/vtu/betting" },
  { label: "Education", icon: GraduationCap, to: "/vtu/education" },
  { label: "Recharge Card", icon: Printer, to: "/vtu/recharge-card" },
];

export default function VtuHub() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Services</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {SERVICES.map(({ label, icon: Icon, to }) => (
          <Link key={to} to={to}>
            <Card className="flex flex-col items-center gap-3 !p-5 text-center transition hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                <Icon size={22} />
              </div>
              <span className="text-sm font-medium text-text-primary dark:text-gray-100">{label}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
