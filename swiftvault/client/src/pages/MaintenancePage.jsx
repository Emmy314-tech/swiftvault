import { Wrench } from "lucide-react";

export default function MaintenancePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center dark:bg-gray-950">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl gradient-primary">
        <Wrench size={36} className="text-white" />
      </div>
      <h1 className="text-2xl font-bold text-text-primary dark:text-gray-100">We'll be right back</h1>
      <p className="mt-2 max-w-sm text-sm text-text-secondary dark:text-gray-400">
        SwiftVault is currently undergoing scheduled maintenance to improve your experience.
        Please check back shortly.
      </p>
    </div>
  );
}
