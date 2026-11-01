import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Receipt, Wallet2, TrendingUp, ArrowRight, AlertTriangle } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import { SkeletonCard } from "../../components/ui/Skeleton.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import {
  getAdminDashboard,
  getUserStatistics,
  getTransactionStatistics,
  getCompanyWalletSummary,
  getFinancialLedgerReport,
  getFinancialLedgerStatus,
} from "../../services/adminService.js";

export default function AdminDashboard() {
  const [overview, setOverview] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [txStats, setTxStats] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [financialLedger, setFinancialLedger] = useState(null);
  const [ledgerStatus, setLedgerStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [o, u, t, w, l] = await Promise.all([
        getAdminDashboard(),
        getUserStatistics(),
        getTransactionStatistics(),
        getCompanyWalletSummary(),
        getFinancialLedgerStatus(),
      ]);
      setOverview(o.data);
      setUserStats(u.data);
      setTxStats(t.data);
      setWallet(w.data);
      setLedgerStatus(l.data);
      if (l.data.ready) {
        try {
          const { data } = await getFinancialLedgerReport({ limit: 1 });
          setFinancialLedger(data.summary);
        } catch {
          setFinancialLedger(null);
        }
      } else {
        setFinancialLedger(null);
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }
  if (error) return <ErrorState message="Could not load dashboard data." onRetry={load} />;

  const successCount = txStats.byStatus.find((s) => s._id === "success")?.count || 0;
  const failedCount = txStats.byStatus.find((s) => s._id === "failed")?.count || 0;

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Dashboard Overview</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="Total Users" value={overview.totalUsers} color="text-primary-600 bg-primary-50 dark:bg-primary-900/30" />
        <StatCard icon={Receipt} label="Total Transactions" value={overview.totalTransactions} color="text-info bg-info-light dark:bg-info/10" />
        <StatCard icon={TrendingUp} label="Successful transaction amounts (not revenue)" value={`₦${Number(overview.totalVolume).toLocaleString()}`} color="text-success bg-success-light dark:bg-success/10" />
        <StatCard icon={Wallet2} label="Company Balance" value={`₦${Number(wallet.balance).toLocaleString()}`} color="text-warning bg-warning-light dark:bg-warning/10" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold text-text-primary dark:text-gray-100">User Breakdown</h3>
          <div className="space-y-2 text-sm">
            <Row label="Basic" value={userStats.normalUsers} />
            <Row label="Retail" value={userStats.retailUsers} />
            <Row label="Wholesale" value={userStats.wholesaleUsers} />
            <Row label="Verified" value={userStats.verifiedUsers} />
            <Row label="New (30 days)" value={userStats.newUsersLast30Days} />
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Transaction Status</h3>
          <div className="space-y-2 text-sm">
            <Row label="Successful" value={successCount} />
            <Row label="Failed" value={failedCount} />
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          {!ledgerStatus?.ready && <AlertTriangle size={18} className="text-warning" />}
          <h3 className="font-semibold text-text-primary dark:text-gray-100">Financial Results</h3>
        </div>
        {!ledgerStatus?.ready ? (
          <p className="text-sm text-text-secondary">
            Financial totals are withheld until legacy history is evidence-reconciled.
            Backfill state: {ledgerStatus?.reportingStatus || "unknown"}; unresolved sources: {ledgerStatus?.unresolvedSourceCount ?? "unknown"}.
          </p>
        ) : !financialLedger ? (
          <p className="text-sm text-error">Ledger report is temporarily unavailable; transaction amounts are not presented as income.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Row label="Total income" value={`₦${Number(financialLedger.totalIncome || 0).toLocaleString()}`} />
            <Row label="Total expenses" value={`₦${Number(financialLedger.totalExpenses || 0).toLocaleString()}`} />
            <Row label="Net operating result" value={`₦${Number(financialLedger.netOperatingResult || 0).toLocaleString()}`} />
            <Row label="Customer wallet liabilities" value={`₦${Number(financialLedger.customerWalletLiabilities || 0).toLocaleString()}`} />
            <Row label="Membership revenue" value={`₦${Number(financialLedger.membershipRevenue || 0).toLocaleString()}`} />
            <Row label="VTU service revenue" value={`₦${Number(financialLedger.serviceRevenue || 0).toLocaleString()}`} />
            <Row label="Provider commission income" value={`₦${Number(financialLedger.providerCommissionIncome || 0).toLocaleString()}`} />
            <Row label="Unsettled provider commissions" value={`₦${Number(financialLedger.providerCommissionReceivable || 0).toLocaleString()}`} />
            <Row label="VTU provider costs" value={`₦${Number(financialLedger.providerCosts || 0).toLocaleString()}`} />
            <Row label="VTU provider fees" value={`₦${Number(financialLedger.providerFees || 0).toLocaleString()}`} />
            <Row label="VTU margin" value={`₦${Number(financialLedger.vtuMargin || 0).toLocaleString()}`} />
            <Row label="Transfer fee income" value={`₦${Number(financialLedger.transferFeeIncome || 0).toLocaleString()}`} />
            <Row label="Payment-provider charges" value={`₦${Number(financialLedger.paymentProcessorFees || 0).toLocaleString()}`} />
            <Row label="Operating expenses" value={`₦${Number(financialLedger.operatingExpenses || 0).toLocaleString()}`} />
            <Row label="Referral bonus expenses" value={`₦${Number(financialLedger.referralBonusExpenses || 0).toLocaleString()}`} />
            <Row label="Refunds and chargebacks" value={`₦${Number(financialLedger.refundsAndChargebacks || 0).toLocaleString()}`} />
            <Row label="Pending deposits" value={`₦${Number(financialLedger.pendingDeposits?.amount || 0).toLocaleString()} (${financialLedger.pendingDeposits?.count || 0})`} />
            <Row label="Quarantined deposits (not revenue)" value={`₦${Number(financialLedger.quarantinedDeposits?.amount || 0).toLocaleString()}`} />
            <Row label="Pending bank transfers" value={`₦${Number(financialLedger.pendingBankTransferLiability || 0).toLocaleString()}`} />
            <Row label="Pending service purchases" value={`₦${Number(financialLedger.pendingServiceLiability || 0).toLocaleString()}`} />
            <Row label="Provider clearing balance" value={`₦${Number(financialLedger.providerClearingBalance || 0).toLocaleString()}`} />
            <Row label="Wallet reconciliation difference" value={`₦${Number(financialLedger.walletReconciliation?.absoluteDifference || 0).toLocaleString()} (${financialLedger.walletReconciliation?.userCount || 0} users)`} />
            <Row label="External statement reconciliation" value={financialLedger.externalStatementReconciliation || "NOT_CONFIGURED"} />
            <Link to="/admin/reports" className="text-sm font-medium text-primary-600 hover:underline sm:col-span-2 lg:col-span-4">
              Filter, inspect and export financial ledger entries
            </Link>
          </div>
        )}
      </Card>

      <Link to="/admin/company-wallet" className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm dark:bg-gray-900 dark:border dark:border-gray-800">
        <span className="text-sm font-medium text-text-primary dark:text-gray-100">View full Company Wallet breakdown</span>
        <ArrowRight size={18} className="text-primary-600" />
      </Link>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <Card className="!p-4">
      <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${color}`}>
        <Icon size={17} />
      </div>
      <p className="text-lg font-bold text-text-primary dark:text-gray-100">{value}</p>
      <p className="text-xs text-text-secondary dark:text-gray-400">{label}</p>
    </Card>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-secondary dark:text-gray-400">{label}</span>
      <span className="font-semibold text-text-primary dark:text-gray-100">{value}</span>
    </div>
  );
}
