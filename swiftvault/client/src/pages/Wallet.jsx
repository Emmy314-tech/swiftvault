import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet2, Send, Users, RefreshCw } from "lucide-react";
import { getDashboard } from "../services/dashboardService.js";
import { getPaystackDedicatedAccount } from "../services/fundingService.js";
import BalanceCard from "../components/dashboard/BalanceCard.jsx";
import RecentTransactions from "../components/dashboard/RecentTransactions.jsx";
import Card from "../components/ui/Card.jsx";
import { SkeletonCard } from "../components/ui/Skeleton.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";

const ACTIONS = [
  { label: "Fund Wallet", icon: Wallet2, to: "/wallet/fund" },
  { label: "SwiftVault Transfer", icon: Send, to: "/transfer" },
  { label: "Beneficiaries", icon: Users, to: "/wallet/beneficiaries" },
];

export default function Wallet() {
  const [stats, setStats] = useState(null);
  const [paystackAccount, setPaystackAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getDashboard();
      setStats(data);
      try {
        const { data } = await getPaystackDedicatedAccount();
        setPaystackAccount(data);
      } catch {
        setPaystackAccount(null);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (error) return <ErrorState message="Could not load your wallet." onRetry={load} />;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Wallet</h1>
        <button
          onClick={load}
          aria-label="Refresh"
          className="rounded-full p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <BalanceCard
        walletBalance={stats.walletBalance}
        bonusBalance={stats.bonusBalance}
        paystackAccount={paystackAccount}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ACTIONS.map(({ label, icon: Icon, to }) => (
          <Link key={to} to={to}>
            <Card className="flex flex-col items-center gap-2 !p-4 text-center hover:shadow-md transition">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                <Icon size={20} />
              </div>
              <span className="text-xs font-medium text-text-secondary dark:text-gray-400">{label}</span>
            </Card>
          </Link>
        ))}
      </div>

      <RecentTransactions transactions={stats.recentTransactions} />
    </div>
  );
}
