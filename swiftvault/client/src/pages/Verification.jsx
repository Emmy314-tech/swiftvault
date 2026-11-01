import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, LockKeyhole, ShieldCheck } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import { SkeletonCard } from "../components/ui/Skeleton.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { getKycOverview } from "../services/kycService.js";

const formatNaira = (amount) => amount == null ? "Not configured" : `₦${Number(amount).toLocaleString()}`;
const statusIcon = (status) => status === "verified" ? CheckCircle2 : status === "pending" ? Clock3 : AlertTriangle;

export default function Verification() {
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getKycOverview();
      setOverview(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <SkeletonCard />;
  if (error) return <ErrorState message="Could not load verification status." onRetry={load} />;

  const { verification, transactionPolicy, blockers } = overview;
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <ShieldCheck className="text-primary-600" size={23} />
        <div>
          <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Identity verification</h1>
          <p className="text-sm text-text-secondary dark:text-gray-400">Your verification tier is separate from paid membership.</p>
        </div>
      </div>

      <Card className="border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
        <div className="flex gap-3">
          <LockKeyhole className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" size={19} />
          <div>
            <h2 className="font-semibold text-amber-900 dark:text-amber-200">Verification is not available yet</h2>
            <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
              SwiftVault has not configured an authorized identity or liveness provider. No BVN, NIN, identity document, or biometric data is requested or stored here.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold text-text-primary dark:text-gray-100">Current verification tier</h2>
        <p className="mt-1 text-sm text-text-secondary dark:text-gray-400">
          {verification.currentTier ? `Tier ${verification.currentTier} verified` : "No verification tier completed"}
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {verification.tiers.map((tier) => (
          <Card key={tier.tier} className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">Tier {tier.tier}</p>
                <h2 className="font-semibold text-text-primary dark:text-gray-100">
                  {["", "Basic identity", "Enhanced identity", "Full verification"][tier.tier]}
                </h2>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{tier.statusLabel}</span>
            </div>
            <ul className="space-y-2">
              {tier.requirements.map((requirement) => {
                const Icon = statusIcon(requirement.status);
                return (
                  <li key={requirement.key} className="flex gap-2 text-sm text-text-secondary dark:text-gray-300">
                    <Icon size={16} className="mt-0.5 shrink-0" />
                    <span>{requirement.label} <span className="block text-xs text-gray-500">{requirement.capability === "UNCONFIGURED" ? "Provider/check unconfigured" : requirement.statusLabel}</span></span>
                  </li>
                );
              })}
            </ul>
            {tier.reason && <p className="text-sm text-error">{tier.reason}</p>}
            <Button disabled icon={LockKeyhole} variant="outline">
              {tier.tier === 1 ? "Verification unavailable" : `Upgrade to Tier ${tier.tier} unavailable`}
            </Button>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="font-semibold text-text-primary dark:text-gray-100">Transaction policy</h2>
        <p className="mt-1 text-sm text-text-secondary dark:text-gray-400">
          Daily accounting timezone: {transactionPolicy.dailyTimeZone || "Not approved"}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {transactionPolicy.tiers.map((tier) => (
            <div key={tier.tier} className="rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-800/60">
              <p className="font-medium text-text-primary dark:text-gray-100">Tier {tier.tier}</p>
              <p className="mt-1 text-text-secondary dark:text-gray-400">Minimum amount: {formatNaira(tier.minimumAmount)}</p>
              <p className="mt-1 text-text-secondary dark:text-gray-400">Per transaction: {formatNaira(tier.maximumPerTransaction)}</p>
              <p className="text-text-secondary dark:text-gray-400">Daily outgoing: {formatNaira(tier.maximumOutgoingPerDay)}</p>
              <p className="text-text-secondary dark:text-gray-400">Daily count: {tier.maximumOutgoingCountPerDay ?? "Not configured"}</p>
              <p className="text-text-secondary dark:text-gray-400">Wallet balance cap: {formatNaira(tier.maximumWalletBalance)}</p>
              <p className="text-text-secondary dark:text-gray-400">Funding per transaction/day: {formatNaira(tier.maximumFundingPerTransaction)} / {formatNaira(tier.maximumFundingPerDay)}</p>
              <p className="text-text-secondary dark:text-gray-400">Withdrawal per transaction/day: {formatNaira(tier.maximumWithdrawalPerTransaction)} / {formatNaira(tier.maximumWithdrawalPerDay)}</p>
              <p className="text-text-secondary dark:text-gray-400">Withdrawal count/day: {tier.maximumWithdrawalCountPerDay ?? "Not configured"}</p>
              <p className="text-text-secondary dark:text-gray-400">Funding methods: {tier.fundingMethods.join(", ") || "None approved"}</p>
              <p className="text-text-secondary dark:text-gray-400">Services: {tier.eligibleServices.join(", ") || "None approved"}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-400">Money-out and wallet-funded services are disabled until KYC providers and approved tier limits are configured.</p>
        <p className="mt-1 text-xs text-text-secondary dark:text-gray-400">Remaining daily allowance: unavailable because no limit or accounting timezone is approved.</p>
      </Card>

      {blockers.length > 0 && (
        <Card>
          <h2 className="font-semibold text-text-primary dark:text-gray-100">What is needed to continue</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-secondary dark:text-gray-300">
            {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            <li>Compliance approval of the licensed business model, tier requirements, limits, eligible services, and accounting timezone.</li>
            <li>Written provider contracts, official API documentation, credentials, and permissions for each identity check.</li>
          </ul>
        </Card>
      )}
      <Button variant="outline" onClick={() => { load(); toast("Verification status refreshed", "info"); }}>Refresh status</Button>
    </div>
  );
}
