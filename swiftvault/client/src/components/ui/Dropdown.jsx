import { useState, useRef, useEffect } from "react";

export default function Dropdown({ trigger, items, align = "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const handleEscape = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          role="menu"
          className={`absolute z-40 mt-2 w-48 animate-fade-in rounded-xl border border-borderc bg-white py-1.5 shadow-lg dark:border-gray-800 dark:bg-gray-900 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} className="my-1 border-t border-borderc dark:border-gray-800" />
            ) : (
              <button
                key={i}
                role="menuitem"
                onClick={() => { item.onClick?.(); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                  item.danger ? "text-error" : "text-text-primary dark:text-gray-200"
                }`}
              >
                {item.icon && <item.icon size={16} />}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
