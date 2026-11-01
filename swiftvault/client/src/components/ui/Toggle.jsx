export default function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="pr-4">
        {label && <p className="text-sm font-medium text-text-primary dark:text-gray-100">{label}</p>}
        {description && <p className="text-xs text-text-secondary dark:text-gray-400">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-700"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
