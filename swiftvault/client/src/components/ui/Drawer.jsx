import { X } from "lucide-react";
import { useEffect } from "react";

export default function Drawer({ open, onClose, title, side = "right", children, widthClass = "max-w-sm" }) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const sideClasses = side === "right" ? "right-0 animate-slide-in-right" : "left-0";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 animate-fade-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-0 h-full w-full ${widthClass} bg-white shadow-xl dark:bg-gray-900 ${sideClasses} flex flex-col`}
      >
        <div className="flex items-center justify-between border-b border-borderc px-5 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
