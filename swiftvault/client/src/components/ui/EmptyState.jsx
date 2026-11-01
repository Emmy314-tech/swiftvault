export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <Icon size={26} className="text-gray-400" />
        </div>
      )}
      <p className="font-semibold text-gray-700 dark:text-gray-200">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-gray-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
