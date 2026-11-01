import { ArrowUpRight, CheckCircle2, XCircle, Receipt } from "lucide-react";
import Card from "../ui/Card.jsx";

export default function StatsGrid({ stats }) {
  const items = [
    { label: "Total Spent", value: `₦${Number(stats.totalSpent || 0).toLocaleString()}`, icon: ArrowUpRight, color: "text-primary-600 bg-primary-50 dark:bg-primary-900/30" },
    { label: "Transactions", value: stats.totalTransactions ?? 0, icon: Receipt, color: "text-info bg-info-light dark:bg-info/10" },
    { label: "Successful", value: stats.successfulTransactions ?? 0, icon: CheckCircle2, color: "text-success bg-success-light dark:bg-success/10" },
    { label: "Failed", value: stats.failedTransactions ?? 0, icon: XCircle, color: "text-error bg-error-light dark:bg-error/10" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ label, value, icon: Icon, color }) => (
        <Card key={label} className="!p-4">
          <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${color}`}>
            <Icon size={17} />
          </div>
          <p className="text-lg font-bold text-text-primary dark:text-gray-100">{value}</p>
          <p className="text-xs text-text-secondary dark:text-gray-400">{label}</p>
        </Card>
      ))}
    </div>
  );
}
