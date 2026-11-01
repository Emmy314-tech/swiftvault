import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Gift, Copy, Share2, TrendingUp } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import { SkeletonCard } from "../components/ui/Skeleton.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { getUserDashboard } from "../services/dashboardService.js";
import { getTransactions } from "../services/transactionService.js";

export default function Referral() {
  const toast = useToast();
  const [dashboard, setDashboard] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [dashboardData, { data: txList }] = await Promise.all([getUserDashboard(), getTransactions()]);
      setDashboard(dashboardData);
      setTransactions(txList);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const referralEarnings = useMemo(
    () => transactions.filter((t) => t.type === "referral_upgrade_bonus" || t.type === "referral_bonus"),
    [transactions]
  );

  const totalEarnings = referralEarnings.reduce((sum, t) => sum + Number(t.amount), 0);

  const code = dashboard?.referrals?.code;
  const referredUsers = dashboard?.referrals?.users || [];
  const link = code ? `${window.location.origin}/register?ref=${code}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    toast("Referral link copied", "success");
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    toast("Referral code copied", "success");
  };

  const handleShare = async () => {
    const text = `Join me on SwiftVault! Use my referral code ${code} when you sign up: ${link}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Join SwiftVault", text }); } catch { /* cancelled */ }
    } else {
      navigator.clipboard.writeText(text);
      toast("Referral message copied to clipboard", "success");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (error) return <ErrorState message="Could not load referral data." onRetry={load} />;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Referrals</h1>
      </div>

      <div className="overflow-hidden rounded-2xl gradient-primary p-6 text-white">
        <div className="flex items-center gap-2 mb-1">
          <Gift size={18} className="text-white/80" />
          <p className="text-sm text-white/80">Total Referral Earnings</p>
        </div>
        <p className="text-3xl font-bold">₦{totalEarnings.toLocaleString()}</p>
        <p className="mt-1 text-xs text-white/70">From {referralEarnings.length} commission{referralEarnings.length === 1 ? "" : "s"}</p>
      </div>

      <Card>
        <p className="mb-2 text-xs font-medium text-text-secondary dark:text-gray-400">Your Referral Code</p>
        <div className="mb-3 flex items-center justify-between rounded-xl border border-borderc px-3 py-2.5 dark:border-gray-700">
          <span className="font-mono text-lg font-bold text-text-primary dark:text-gray-100">{code || "—"}</span>
          <button onClick={copyCode} aria-label="Copy code" className="text-primary-600"><Copy size={17} /></button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyLink}
            className="flex-1 rounded-xl border border-borderc py-2.5 text-sm font-semibold text-text-primary dark:border-gray-700 dark:text-gray-100"
          >
            Copy Link
          </button>
          <button
            onClick={handleShare}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white"
          >
            <Share2 size={16} /> Share
          </button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp size={17} className="text-primary-600" />
          <h3 className="font-semibold text-text-primary dark:text-gray-100">People who joined with your link</h3>
        </div>
        {!referredUsers.length ? (
          <EmptyState
            icon={Gift}
            title="No referred sign-ups yet"
            description="New accounts created with your referral code will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-text-secondary dark:text-gray-400">
                <tr>
                  <th className="pb-2 pr-4 font-medium">User</th>
                  <th className="pb-2 pr-4 font-medium">Joined</th>
                  <th className="pb-2 pr-4 font-medium">Paid upgrade</th>
                  <th className="pb-2 font-medium">Converted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderc dark:divide-gray-800">
                {referredUsers.map((user) => (
                  <tr key={user._id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text-primary dark:text-gray-100">{user.fullName || user.username}</p>
                      <p className="text-xs text-text-secondary dark:text-gray-400">@{user.username}</p>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary dark:text-gray-400">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={user.convertedAt ? "success" : "neutral"}>
                        {user.convertedAt ? "Converted" : "Not converted"}
                      </Badge>
                    </td>
                    <td className="py-3 text-text-secondary dark:text-gray-400">
                      {user.convertedAt ? new Date(user.convertedAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp size={17} className="text-primary-600" />
          <h3 className="font-semibold text-text-primary dark:text-gray-100">Commission History</h3>
        </div>

        {referralEarnings.length === 0 ? (
          <EmptyState
            icon={Gift}
            title="No referral earnings yet"
            description="Eligible upgraded users earn a commission when someone they referred completes a paid membership upgrade."
          />
        ) : (
          <div className="divide-y divide-borderc dark:divide-gray-800">
            {referralEarnings.map((tx) => (
              <div key={tx._id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary dark:text-gray-100">{tx.description}</p>
                  <p className="text-xs text-text-secondary dark:text-gray-400">
                    {new Date(tx.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-success">+₦{Number(tx.amount).toLocaleString()}</p>
                  <Badge variant="success">{tx.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-center text-xs text-text-secondary dark:text-gray-500">
        A referral reward is paid only if your SwiftVault account is already upgraded when the person you referred completes a paid membership upgrade.
      </p>
    </div>
  );
}
