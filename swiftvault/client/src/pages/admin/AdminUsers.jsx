import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import SearchBar from "../../components/ui/SearchBar.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import Table from "../../components/ui/Table.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { SkeletonList } from "../../components/ui/Skeleton.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { listAllUsers, toggleSuspendUser } from "../../services/adminService.js";

const TIER_LABEL = { normal: "Normal", retail: "Retail", wholesale: "Wholesale" };
const PAGE_SIZE = 15;

export default function AdminUsers() {
  const navigate = useNavigate();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [pinError, setPinError] = useState("");

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await listAllUsers();
      setUsers(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter((u) =>
      [u.fullName, u.username, u.email, u.phone].some((v) => v?.toLowerCase().includes(q))
    );
  }, [users, search]);

  useEffect(() => { setPage(1); }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleConfirmPin = async (adminPin) => {
    const user = pendingUser;
    setPinError("");
    try {
      await toggleSuspendUser(user._id, { adminPin });
      setUsers((prev) => prev.map((u) => (u._id === user._id ? { ...u, isSuspended: !u.isSuspended } : u)));
      toast(user.isSuspended ? "User reactivated" : "User suspended", "success");
      setPendingUser(null);
    } catch (err) {
      setPinError(err.response?.data?.message || "Action failed");
    }
  };

  const columns = [
    { key: "fullName", header: "Name", render: (u) => `${u.fullName} (@${u.username})` },
    { key: "phone", header: "Phone" },
    { key: "tier", header: "Tier", render: (u) => u.role === "admin" ? "—" : <Badge variant={u.tier === "normal" ? "neutral" : "primary"}>{TIER_LABEL[u.tier] || u.tier || "Normal"}</Badge> },
    { key: "isUpgraded", header: "Upgrade", render: (u) => u.role === "admin" ? "—" : <Badge variant={u.isUpgraded ? "primary" : "neutral"}>{u.isUpgraded ? "Upgraded" : "Normal"}</Badge> },
    { key: "walletBalance", header: "Balance", render: (u) => `₦${Number(u.walletBalance || 0).toLocaleString()}` },
    {
      key: "isSuspended",
      header: "Status",
      render: (u) => <Badge variant={u.isSuspended ? "error" : "success"}>{u.isSuspended ? "Suspended" : "Active"}</Badge>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (u) => (
        <button
          onClick={(e) => { e.stopPropagation(); setPendingUser(u); }}
          className={`rounded-lg px-3 py-1 text-xs font-semibold ${u.isSuspended ? "bg-success-light text-success" : "bg-error-light text-error"}`}
        >
          {u.isSuspended ? "Reactivate" : "Suspend"}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">User Management</h1>

      <Card>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name, username, email, or phone..." />
      </Card>

      {loading && <SkeletonList count={8} />}
      {error && <ErrorState message="Could not load users." onRetry={load} />}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState icon={Users} title="No users found" />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <Table columns={columns} data={paginated} keyField="_id" onRowClick={(u) => navigate(`/admin/users/${u._id}`)} />
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      <PinConfirmModal
        open={!!pendingUser}
        onClose={() => setPendingUser(null)}
        onConfirm={handleConfirmPin}
        error={pinError}
        title="Confirm with Admin PIN"
        subtitle={pendingUser ? `${pendingUser.isSuspended ? "Reactivate" : "Suspend"} ${pendingUser.fullName}` : ""}
      />
    </div>
  );
}
