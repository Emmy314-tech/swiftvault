import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import SearchBar from "../../components/ui/SearchBar.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import Table from "../../components/ui/Table.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { SkeletonList } from "../../components/ui/Skeleton.jsx";
import { getFinancialAuditLog } from "../../services/adminService.js";

const OPERATION_LABELS = {
  wallet_funding: "Wallet Funding",
  swiftvault_transfer_debit: "Transfer (Sent)",
  swiftvault_transfer_credit: "Transfer (Received)",
  bank_transfer: "Bank Transfer",
  vtu_purchase: "VTU Purchase",
  vtu_refund: "VTU Refund",
  upgrade: "Account Upgrade",
  referral_commission: "Referral Commission",
  admin_wallet_adjustment: "Admin Wallet Adjustment",
  company_withdrawal: "Company Withdrawal",
};

export default function FinancialAuditTrail() {
  const [result, setResult] = useState({ logs: [], total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [operationType, setOperationType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getFinancialAuditLog({ page, limit: 20, search: search || undefined, operationType: operationType || undefined });
      setResult(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, search, operationType]);
  useEffect(() => { setPage(1); }, [search, operationType]);

  const columns = [
    { key: "createdAt", header: "Date", render: (r) => new Date(r.createdAt).toLocaleString() },
    { key: "operationType", header: "Operation", render: (r) => <Badge variant="primary">{OPERATION_LABELS[r.operationType] || r.operationType}</Badge> },
    { key: "user", header: "User", render: (r) => r.user ? `${r.user.fullName} (@${r.user.username})` : "-" },
    { key: "admin", header: "Admin", render: (r) => r.admin ? `${r.admin.fullName}` : "-" },
    { key: "balanceBefore", header: "Before", render: (r) => `₦${Number(r.balanceBefore).toLocaleString()}` },
    { key: "balanceAfter", header: "After", render: (r) => `₦${Number(r.balanceAfter).toLocaleString()}` },
    { key: "amount", header: "Amount", render: (r) => `₦${Number(r.amount).toLocaleString()}` },
    { key: "reference", header: "Reference" },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <ShieldCheck size={22} className="text-primary-600" />
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Financial Audit Trail</h1>
      </div>

      <Card className="flex gap-3 bg-info-light dark:bg-info/10">
        <p className="text-sm text-text-secondary dark:text-gray-300">
          These records are immutable - no edit or delete capability exists anywhere in the system.
        </p>
      </Card>

      <Card>
        <div className="space-y-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by reference or reason..." />
          <select
            value={operationType}
            onChange={(e) => setOperationType(e.target.value)}
            className="rounded-lg border border-borderc bg-white px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="">All Operations</option>
            {Object.keys(OPERATION_LABELS).map((op) => <option key={op} value={op}>{OPERATION_LABELS[op]}</option>)}
          </select>
        </div>
      </Card>

      {loading && <SkeletonList count={8} />}
      {error && <ErrorState message="Could not load audit trail." onRetry={load} />}

      {!loading && !error && result.logs.length === 0 && (
        <EmptyState icon={ShieldCheck} title="No financial audit records yet" />
      )}

      {!loading && !error && result.logs.length > 0 && (
        <>
          <Table columns={columns} data={result.logs} keyField="_id" />
          <Pagination page={page} totalPages={result.totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
