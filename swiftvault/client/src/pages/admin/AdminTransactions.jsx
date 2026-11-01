import { useEffect, useState } from "react";
import { Receipt as ReceiptIcon } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import SearchBar from "../../components/ui/SearchBar.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import Table from "../../components/ui/Table.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { SkeletonList } from "../../components/ui/Skeleton.jsx";
import { getAllTransactions } from "../../services/adminService.js";
import { STATUS_VARIANT, TYPE_LABEL, ALL_TYPES } from "../../utils/transactionLabels.js";

export default function AdminTransactions() {
  const [result, setResult] = useState({ transactions: [], total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getAllTransactions({ page, limit: 20, search: search || undefined, status: status || undefined, type: type || undefined });
      setResult(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, search, status, type]);
  useEffect(() => { setPage(1); }, [search, status, type]);

  const columns = [
    { key: "createdAt", header: "Date", render: (r) => new Date(r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) },
    { key: "description", header: "Description", render: (r) => r.description || TYPE_LABEL[r.type] || r.type },
    { key: "amount", header: "Amount", render: (r) => `₦${Number(r.amount).toLocaleString()}` },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status] || "neutral"}>{r.status}</Badge> },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        r.status === "pending" ? (
          <span className="text-xs text-gray-500">Awaiting provider confirmation</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Transaction Management</h1>

      <Card>
        <div className="space-y-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search description or reference..." />
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <select value={type} onChange={(e) => setType(e.target.value)} className="shrink-0 rounded-lg border border-borderc bg-white px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              <option value="">All Types</option>
              {ALL_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="shrink-0 rounded-lg border border-borderc bg-white px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              <option value="">All Statuses</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </Card>

      {loading && <SkeletonList count={8} />}
      {error && <ErrorState message="Could not load transactions." onRetry={load} />}

      {!loading && !error && result.transactions.length === 0 && (
        <EmptyState icon={ReceiptIcon} title="No transactions found" />
      )}

      {!loading && !error && result.transactions.length > 0 && (
        <>
          <Table columns={columns} data={result.transactions} keyField="_id" />
          <Pagination page={page} totalPages={result.totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
