import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

export default function SearchBar({ value, onChange, placeholder = "Search...", debounceMs = 350 }) {
  const [local, setLocal] = useState(value || "");

  useEffect(() => setLocal(value || ""), [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (local !== value) onChange(local);
    }, debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <div className="relative">
      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-borderc bg-white py-2.5 pl-10 pr-9 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
      {local && (
        <button
          onClick={() => setLocal("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
