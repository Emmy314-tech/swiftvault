export default function Table({ columns, data, onRowClick, keyField = "_id" }) {
  return (
    <>
      {/* Desktop/tablet table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-borderc dark:border-gray-800 sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borderc bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 text-left font-medium text-text-secondary dark:text-gray-400">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row[keyField]}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-borderc last:border-0 dark:border-gray-800 ${
                  onRowClick ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" : ""
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-text-primary dark:text-gray-200">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list fallback */}
      <div className="space-y-2 sm:hidden">
        {data.map((row) => (
          <div
            key={row[keyField]}
            onClick={() => onRowClick?.(row)}
            className={`rounded-2xl border border-borderc bg-white p-4 dark:border-gray-800 dark:bg-gray-900 ${
              onRowClick ? "cursor-pointer active:scale-[0.99]" : ""
            }`}
          >
            {columns.map((col) => (
              <div key={col.key} className="flex justify-between py-1 text-sm">
                <span className="text-text-secondary dark:text-gray-400">{col.header}</span>
                <span className="font-medium text-text-primary dark:text-gray-200">
                  {col.render ? col.render(row) : row[col.key]}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
