import { Loader2 } from "lucide-react";

export function Spinner({ size = 24, className = "" }) {
  return <Loader2 size={size} className={`animate-spin text-primary-600 ${className}`} />;
}

export function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <Spinner size={32} />
    </div>
  );
}
