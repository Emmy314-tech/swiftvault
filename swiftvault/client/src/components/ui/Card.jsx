export default function Card({ children, className = "", padded = true, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-white shadow-sm dark:bg-gray-900 dark:shadow-none dark:border dark:border-gray-800 ${
        padded ? "p-4" : ""
      } ${onClick ? "cursor-pointer active:scale-[0.99] transition" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
