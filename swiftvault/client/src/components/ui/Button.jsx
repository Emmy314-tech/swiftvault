import { Loader2 } from "lucide-react";

const VARIANTS = {
  primary: "bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50",
  secondary: "bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-300",
  outline: "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
  ghost: "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
};

export default function Button({
  children,
  onClick,
  type = "button",
  disabled = false,
  loading = false,
  variant = "primary",
  size = "md",
  fullWidth = true,
  icon: Icon,
  className = "",
}) {
  const sizeClasses = size === "sm" ? "py-2 px-3 text-sm" : "py-3 px-4 text-base";

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${fullWidth ? "w-full" : ""} inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed ${sizeClasses} ${VARIANTS[variant]} ${className}`}
    >
      {loading ? (
        <Loader2 size={18} className="animate-spin" />
      ) : (
        Icon && <Icon size={18} />
      )}
      {children}
    </button>
  );
}
