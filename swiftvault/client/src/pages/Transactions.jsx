import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Receipt as ReceiptIcon } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import Button from "../components/ui/Button.jsx";
import SearchBar from "../components/ui/SearchBar.jsx";
import Pagination from "../components/ui/Pagination.jsx";
import Table from "../components/ui/Table.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import { SkeletonList } from "../components/ui/Skeleton.jsx";
import { getTransactions } from "../services/transactionService.js";
import { CREDIT_TYPES, STATUS_VARIANT, TYPE_LABEL, ALL_TYPES } from "../utils/transactionLabels.js";
import { exportToCsv } from "../utils/exportCsv.js";

const PAGE_SIZE = 15;

export default function Transactions() {
  const navigate = useNavigate();
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getTransactions();
      setAll(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return all.filter((tx) => {
      if (typeFilter !== "all" && tx.type !== typeFilter) return false;
      if (statusFilter !== "all" && tx.status !== statusFilter) return false;
      if (search) {
        const haystack = `${tx.description || ""} ${tx.reference || ""} ${TYPE_LABEL[tx.type] || tx.type}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [all, search, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, typeFilter, statusFilter]);

  const handleExport = () => {
    exportToCsv(
      `SwiftVault-Transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered,
      [
        { header: "Date", key: "createdAt", csvValue: (r) => new Date(r.createdAt).toLocaleString() },
        { header: "Type", key: "type", csvValue: (r) => TYPE_LABEL[r.type] || r.type },
        { header: "Description", key: "description" },
        { header: "Amount", key: "amount" },
        { header: "Status", key: "status" },
        { header: "Reference", key: "reference" },
      ]
    );
  };

  const columns = [
    { key: "createdAt", header: "Date", render: (r) => new Date(r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) },
    { key: "description", header: "Description", render: (r) => r.description || TYPE_LABEL[r.type] || r.type },
    {
      key: "amount",
      header: "Amount",
      render: (r) => (
        <span className={CREDIT_TYPES.includes(r.type) ? "font-semibold text-success" : "font-semibold"}>
          {CREDIT_TYPES.includes(r.type) ? "+" : "-"}₦{Number(r.amount).toLocaleString()}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status] || "neutral"}>{r.status}</Badge> },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Transaction History</h1>
        <Button variant="outline" size="sm" fullWidth={false} icon={Download} onClick={handleExport}>
          Export CSV
        </Button>
      </div>

      <Card>
        <div className="space-y-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by description or reference..." />

          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="shrink-0 rounded-lg border border-borderc bg-white px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="all">All Types</option>
              {ALL_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="shrink-0 rounded-lg border border-borderc bg-white px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="all">All Statuses</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </Card>

      {loading && <SkeletonList count={8} />}
      {error && <ErrorState message="Could not load transactions." onRetry={load} />}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState icon={ReceiptIcon} title="No transactions found" description="Try adjusting your search or filters." />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <Table
            columns={columns}
            data={paginated}
            keyField="_id"
            onRowClick={(tx) => navigate(`/receipt/${tx.reference || tx._id}`, { state: { transaction: tx } })}
          />
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
