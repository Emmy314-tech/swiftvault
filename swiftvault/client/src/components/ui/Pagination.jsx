import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1
  );

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className="rounded-lg p-2 text-text-secondary hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
      >
        <ChevronLeft size={18} />
      </button>

      {pages.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-text-secondary">…</span>}
          <button
            onClick={() => onPageChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={`h-9 w-9 rounded-lg text-sm font-medium transition ${
              p === page
                ? "bg-primary-600 text-white"
                : "text-text-secondary hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {p}
          </button>
        </span>
      ))}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Next page"
        className="rounded-lg p-2 text-text-secondary hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
