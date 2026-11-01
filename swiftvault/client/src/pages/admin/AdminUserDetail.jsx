import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Wallet2 } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import { SkeletonCard } from "../../components/ui/Skeleton.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import {
  getUserDetail,
  adjustUserBalance,
  updateUserTier,
  updateUserUpgradeStatus,
} from "../../services/adminService.js";
import { TYPE_LABEL, STATUS_VARIANT } from "../../utils/transactionLabels.js";

const TIER_LABEL = { normal: "Normal", retail: "Retail", wholesale: "Wholesale" };

export default function AdminUserDetail() {
  const { userId } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ type: "credit", amount: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState("");
  const [tierSelection, setTierSelection] = useState("normal");
  const [upgradeSelection, setUpgradeSelection] = useState(false);
  const [adminAction, setAdminAction] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getUserDetail(userId);
      setData(data);
      setTierSelection(data.user.tier || "normal");
      setUpgradeSelection(data.user.isUpgraded === true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [userId]);

  const handleAdjust = async (e) => {
    e.preventDefault();
    setPinOpen(true);
  };

  const handleConfirmPin = async (adminPin) => {
    setSaving(true);
    setPinError("");
    try {
      if (adminAction === "tier") {
        await updateUserTier(userId, { tier: tierSelection, adminPin });
        toast("User tier updated; upgrade status was not changed", "success");
      } else if (adminAction === "upgrade") {
        await updateUserUpgradeStatus(userId, { isUpgraded: upgradeSelection, adminPin });
        toast("User upgrade status updated; tier was not changed", "success");
      } else {
        await adjustUserBalance({ userId, amount: Number(adjustForm.amount), type: adjustForm.type, reason: adjustForm.reason, adminPin });
        toast("Wallet adjusted successfully", "success");
        setAdjustForm({ type: "credit", amount: "", reason: "" });
      }
      setAdminAction(null);
      setPinOpen(false);
      load();
    } catch (err) {
      setPinError(err.response?.data?.message || "Adjustment failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonCard />;
  if (error) return <ErrorState message="Could not load user." onRetry={load} />;

  const { user, transactions } = data;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/admin/users" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">{user.fullName}</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Account Info</h3>
          <div className="space-y-2 text-sm">
            <Row label="Username" value={`@${user.username}`} />
            <Row label="Phone" value={user.phone} />
            <Row label="Email" value={user.email} />
            <Row label="Tier" value={user.role === "admin" ? "Not applicable" : <Badge variant={user.tier === "normal" ? "neutral" : "primary"}>{TIER_LABEL[user.tier] || user.tier || "Normal"}</Badge>} />
            <Row label="Upgrade Status" value={user.role === "admin" ? "Not applicable" : <Badge variant={user.isUpgraded ? "primary" : "neutral"}>{user.isUpgraded ? "Upgraded User" : "Normal User"}</Badge>} />
            <Row label="Status" value={<Badge variant={user.isSuspended ? "error" : "success"}>{user.isSuspended ? "Suspended" : "Active"}</Badge>} />
            <Row label="Wallet Balance" value={`₦${Number(user.walletBalance || 0).toLocaleString()}`} />
            <Row label="Bonus Balance" value={`₦${Number(user.bonusBalance || 0).toLocaleString()}`} />
            <Row label="Referral Code" value={user.referralCode} />
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Wallet2 size={17} className="text-primary-600" />
            <h3 className="font-semibold text-text-primary dark:text-gray-100">Adjust Wallet Balance</h3>
          </div>
          <form onSubmit={handleAdjust} className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAdjustForm({ ...adjustForm, type: "credit" })}
                className={`flex-1 rounded-xl border-2 py-2 text-sm font-semibold ${adjustForm.type === "credit" ? "border-success bg-success-light text-success" : "border-borderc text-text-secondary"}`}
              >
                Credit
              </button>
              <button
                type="button"
                onClick={() => setAdjustForm({ ...adjustForm, type: "debit" })}
                className={`flex-1 rounded-xl border-2 py-2 text-sm font-semibold ${adjustForm.type === "debit" ? "border-error bg-error-light text-error" : "border-borderc text-text-secondary"}`}
              >
                Debit
              </button>
            </div>
            <Input type="number" placeholder="Amount" value={adjustForm.amount} onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })} required />
            <Input placeholder="Reason (required, logged)" value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} required />
            <Button type="submit">Apply Adjustment</Button>
          </form>
        </Card>
      </div>

      {user.role !== "admin" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Manage Tier</h3>
            <p className="mb-3 text-xs text-text-secondary">Tier changes do not change upgrade status or VTU pricing.</p>
            <div className="flex gap-2">
              <select
                aria-label="User tier"
                value={tierSelection}
                onChange={(event) => setTierSelection(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-borderc bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="normal">Normal</option>
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
              </select>
              <Button disabled={saving || tierSelection === user.tier} onClick={() => { setAdminAction("tier"); setPinOpen(true); }}>
                Save Tier
              </Button>
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Manage Upgrade Status</h3>
            <p className="mb-3 text-xs text-text-secondary">This administrative override does not charge a fee, change tier, or distribute referral rewards.</p>
            <div className="flex gap-2">
              <select
                aria-label="Upgrade status"
                value={upgradeSelection ? "upgraded" : "normal"}
                onChange={(event) => setUpgradeSelection(event.target.value === "upgraded")}
                className="min-w-0 flex-1 rounded-xl border border-borderc bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="normal">Normal User</option>
                <option value="upgraded">Upgraded User</option>
              </select>
              <Button disabled={saving || upgradeSelection === user.isUpgraded} onClick={() => { setAdminAction("upgrade"); setPinOpen(true); }}>
                Save Status
              </Button>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <h3 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Recent Transactions</h3>
        {transactions.length === 0 ? (
          <EmptyState title="No transactions yet" />
        ) : (
          <div className="divide-y divide-borderc dark:divide-gray-800">
            {transactions.map((tx) => (
              <div key={tx._id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium text-text-primary dark:text-gray-100">{tx.description || TYPE_LABEL[tx.type] || tx.type}</p>
                  <p className="text-xs text-text-secondary">{new Date(tx.createdAt).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">₦{Number(tx.amount).toLocaleString()}</p>
                  <Badge variant={STATUS_VARIANT[tx.status] || "neutral"}>{tx.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <PinConfirmModal
        open={pinOpen}
        onClose={() => { setPinOpen(false); setAdminAction(null); }}
        onConfirm={handleConfirmPin}
        loading={saving}
        error={pinError}
        title={adminAction === "tier" ? "Confirm Tier Change" : adminAction === "upgrade" ? "Confirm Upgrade Status Change" : "Confirm Wallet Adjustment"}
        subtitle="Confirm this administrative action with your Admin PIN"
      />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary dark:text-gray-400">{label}</span>
      <span className="font-medium text-text-primary dark:text-gray-100">{value || "—"}</span>
    </div>
  );
}
