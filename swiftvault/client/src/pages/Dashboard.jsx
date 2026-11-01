import { useEffect, useState } from "react";
import { getDashboard, getUserDashboard } from "../services/dashboardService.js";
import { getPaystackDedicatedAccount } from "../services/fundingService.js";
import { useAuth } from "../context/AuthContext.jsx";
import BalanceCard from "../components/dashboard/BalanceCard.jsx";
import StatsGrid from "../components/dashboard/StatsGrid.jsx";
import QuickActions from "../components/dashboard/QuickActions.jsx";
import RecentTransactions from "../components/dashboard/RecentTransactions.jsx";
import ReferralSummary from "../components/dashboard/ReferralSummary.jsx";
import MembershipStatus from "../components/dashboard/MembershipStatus.jsx";
import { SkeletonCard } from "../components/ui/Skeleton.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [profile, setProfile] = useState(null);
  const [paystackAccount, setPaystackAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(false);
    try {
      const [dashboardData, userData] = await Promise.all([
        getDashboard(),
        getUserDashboard(),
      ]);
      setStats(dashboardData);
      setProfile(userData);

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

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Could not load your dashboard." onRetry={loadData} />;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <p className="text-sm text-text-secondary dark:text-gray-400">
          Welcome back{profile?.user?.fullName ? `,` : ""}
        </p>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">
          {profile?.user?.fullName || user?.fullName}
        </h1>
      </div>

      <BalanceCard
        walletBalance={stats.walletBalance}
        bonusBalance={stats.bonusBalance}
        paystackAccount={paystackAccount}
        username={profile?.user?.username}
      />

      <QuickActions />

      <StatsGrid stats={stats} />

      <div className="grid gap-4 lg:grid-cols-2">
        <MembershipStatus
          tier={profile?.user?.tier}
          isUpgraded={profile?.user?.isUpgraded}
          businessName={profile?.user?.businessName}
          onUpgrade={loadData}
        />
        <ReferralSummary code={stats.referralCode} />
      </div>

      <RecentTransactions transactions={stats.recentTransactions} />
    </div>
  );
}
