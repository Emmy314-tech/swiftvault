import { CheckCircle2, Clock, XCircle } from "lucide-react";

const CONFIG = {
  success: { icon: CheckCircle2, color: "text-success bg-success-light dark:bg-success/10", label: "Successful" },
  pending: { icon: Clock, color: "text-warning bg-warning-light dark:bg-warning/10", label: "Pending" },
  failed: { icon: XCircle, color: "text-error bg-error-light dark:bg-error/10", label: "Failed" },
};

export default function TransactionStatus({ status = "success", size = "md" }) {
  const { icon: Icon, color, label } = CONFIG[status] || CONFIG.success;
  const isLarge = size === "lg";

  return (
    <div className="flex flex-col items-center">
      <div className={`flex items-center justify-center rounded-full ${color} ${isLarge ? "h-16 w-16" : "h-9 w-9"}`}>
        <Icon size={isLarge ? 32 : 18} />
      </div>
      {isLarge && <p className={`mt-2 font-semibold ${color.split(" ")[0]}`}>{label}</p>}
    </div>
  );
}
