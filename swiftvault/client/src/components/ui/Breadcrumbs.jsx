import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 hidden items-center gap-1.5 text-sm sm:flex">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={14} className="text-gray-300" />}
          {item.href && i !== items.length - 1 ? (
            <Link to={item.href} className="text-text-secondary hover:text-primary-600 dark:text-gray-400">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-text-primary dark:text-gray-100">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
