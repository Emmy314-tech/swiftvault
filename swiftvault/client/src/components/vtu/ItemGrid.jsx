import { normalizeItem } from "../../utils/normalizeVtu.js";
import { CheckCircle2 } from "lucide-react";

// Tailwind's JIT scanner needs literal class strings, not runtime-interpolated ones
const COLUMN_CLASSES = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

export default function ItemGrid({ items, selectedValue, onSelect, columns = 4 }) {
  return (
    <div className={`grid gap-2 ${COLUMN_CLASSES[columns] || COLUMN_CLASSES[4]}`}>
      {items.map((raw) => {
        const item = normalizeItem(raw);
        const isSelected = item.value === selectedValue;
        return (
          <button
            key={item.value}
            onClick={() => onSelect(item)}
            className={`relative rounded-xl border-2 p-3 text-center transition ${
              isSelected
                ? "border-primary-600 bg-primary-50 dark:bg-primary-900/20"
                : "border-borderc bg-white dark:border-gray-700 dark:bg-gray-900"
            }`}
          >
            {isSelected && <CheckCircle2 size={14} className="absolute right-1.5 top-1.5 text-primary-600" />}
            <p className="truncate text-xs font-semibold uppercase text-text-primary dark:text-gray-100">
              {item.label}
            </p>
            {item.price != null && (
              <p className="mt-0.5 text-[11px] text-text-secondary dark:text-gray-400">
                ₦{Number(item.price).toLocaleString()}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
