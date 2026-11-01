import { AlertCircle } from "lucide-react";
import Button from "./Button.jsx";

export default function ErrorState({ message = "Something went wrong.", onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
        <AlertCircle size={26} className="text-red-500" />
      </div>
      <p className="font-semibold text-gray-700 dark:text-gray-200">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" fullWidth={false} onClick={onRetry} className="mt-4">
          Try again
        </Button>
      )}
    </div>
  );
}
