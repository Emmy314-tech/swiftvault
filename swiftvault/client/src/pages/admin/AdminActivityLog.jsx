import { useEffect, useState } from "react";
import { ClipboardList, Download } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import SearchBar from "../../components/ui/SearchBar.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import Table from "../../components/ui/Table.jsx";
import Button from "../../components/ui/Button.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { SkeletonList } from "../../components/ui/Skeleton.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getAdminActivityLog } from "../../services/adminService.js";
import { exportToCsv } from "../../utils/exportCsv.js";

const ACTION_LABELS = {
  user_suspended: "User Suspended",
  user_activated: "User Activated",
  wallet_adjusted: "Wallet Adjusted",
  notification_broadcast: "Notification Broadcast",
  notification_sent: "Notification Sent",
  transaction_resolved: "Transaction Resolved",
  pricing_updated: "Pricing Updated",
  membership_updated: "Membership Updated",
  transfer_fees_updated: "Transfer Fees Updated",
  service_toggle_updated: "Service Toggle Updated",
  system_settings_updated: "System Settings Updated",
  bank_account_added: "Bank Account Added",
  bank_account_updated: "Bank Account Updated",
  bank_account_removed: "Bank Account Removed",
  api_credential_changed: "API Credential Changed",
  company_withdrawal: "Company Withdrawal",
};

const ACTION_VARIANT = {
  user_suspended: "error",
  user_activated: "success",
  wallet_adjusted: "warning",
  api_credential_changed: "error",
  company_withdrawal: "warning",
};

export default function AdminActivityLogPage() {
  const toast = useToast();
  const [result, setResult] = useState({ logs: [], total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getAdminActivityLog({ page, limit: 20, search: search || undefined, action: action || undefined });
      setResult(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, search, action]);
  useEffect(() => { setPage(1); }, [search, action]);

  const handleExport = async () => {
    try {
      const { data } = await getAdminActivityLog({ page: 1, limit: 500, search: search || undefined, action: action || undefined });
      exportToCsv(`SwiftVault-Admin-Activity-${new Date().toISOString().slice(0, 10)}.csv`, data.logs, [
        { header: "Date", key: "createdAt", csvValue: (r) => new Date(r.createdAt).toLocaleString() },
        { header: "Admin", key: "adminName" },
        { header: "Action", key: "action", csvValue: (r) => ACTION_LABELS[r.action] || r.action },
        { header: "Description", key: "description" },
        { header: "IP Address", key: "ipAddress" },
      ]);
      toast("Activity log exported", "success");
    } catch {
      toast("Failed to export", "error");
    }
  };

  const columns = [
    { key: "createdAt", header: "Date", render: (r) => new Date(r.createdAt).toLocaleString() },
    { key: "adminName", header: "Admin" },
    { key: "action", header: "Action", render: (r) => <Badge variant={ACTION_VARIANT[r.action] || "neutral"}>{ACTION_LABELS[r.action] || r.action}</Badge> },
    { key: "description", header: "Description" },
    { key: "ipAddress", header: "IP" },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Admin Activity Log</h1>
        <Button variant="outline" size="sm" fullWidth={false} icon={Download} onClick={handleExport}>Export CSV</Button>
      </div>

      <Card>
        <div className="space-y-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by admin name or description..." />
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-lg border border-borderc bg-white px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="">All Actions</option>
            {Object.keys(ACTION_LABELS).map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
          </select>
        </div>
      </Card>

      {loading && <SkeletonList count={8} />}
      {error && <ErrorState message="Could not load activity log." onRetry={load} />}

      {!loading && !error && result.logs.length === 0 && (
        <EmptyState icon={ClipboardList} title="No admin activity recorded yet" />
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
