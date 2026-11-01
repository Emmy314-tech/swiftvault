import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Wallet2 } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import { SkeletonCard } from "../../components/ui/Skeleton.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { getCompanyWalletSummary } from "../../services/adminService.js";

const COLORS = ["#6C3EF4", "#9570F5", "#22C55E", "#3B82F6", "#F59E0B", "#EF4444"];

export default function CompanyWallet() {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getCompanyWalletSummary();
      setWallet(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <SkeletonCard />;
  if (error) return <ErrorState message="Could not load company wallet." onRetry={load} />;

  const breakdown = [
    { name: "Upgrades", value: wallet.totalUpgradeRevenue },
    { name: "Transfer Fees", value: wallet.totalTransferFees },
    { name: "VTU Profit", value: wallet.totalVTUProfit },
    { name: "Cable Profit", value: wallet.totalCableProfit },
    { name: "Electricity Profit", value: wallet.totalElectricityProfit },
    { name: "Education/ePIN Profit", value: wallet.totalEducationProfit + wallet.totalEpinProfit },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Company Wallet</h1>
      </div>

      <div className="overflow-hidden rounded-2xl gradient-primary p-6 text-white">
        <div className="flex items-center gap-2 mb-1">
          <Wallet2 size={18} className="text-white/80" />
          <p className="text-sm text-white/80">Company Wallet Balance</p>
        </div>
        <p className="text-3xl font-bold">₦{Number(wallet.balance).toLocaleString()}</p>
        <p className="mt-1 text-xs text-white/70">Total Revenue Ever: ₦{Number(wallet.totalRevenue).toLocaleString()}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Revenue by Source</h3>
          {breakdown.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-secondary">No revenue recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={breakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                  {breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => `₦${Number(v).toLocaleString()}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Detailed Breakdown</h3>
          <div className="space-y-2.5 text-sm">
            <Row label="Upgrade Revenue" value={wallet.totalUpgradeRevenue} />
            <Row label="Transfer Fees" value={wallet.totalTransferFees} />
            <Row label="VTU (Data/Airtime) Profit" value={wallet.totalVTUProfit} />
            <Row label="Cable Profit" value={wallet.totalCableProfit} />
            <Row label="Electricity Profit" value={wallet.totalElectricityProfit} />
            <Row label="Education Profit" value={wallet.totalEducationProfit} />
            <Row label="ePIN Profit" value={wallet.totalEpinProfit} />
            <Row label="Total Withdrawn" value={wallet.totalWithdrawn} negative />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, negative }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-secondary dark:text-gray-400">{label}</span>
      <span className={`font-semibold ${negative ? "text-error" : "text-text-primary dark:text-gray-100"}`}>
        {negative ? "-" : ""}₦{Number(value || 0).toLocaleString()}
      </span>
    </div>
  );
}
