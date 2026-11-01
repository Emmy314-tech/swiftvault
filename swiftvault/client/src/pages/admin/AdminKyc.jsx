import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { SkeletonCard } from "../../components/ui/Skeleton.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getAdminKycProfiles, reviewTierThree } from "../../services/kycService.js";
import { updateTransactionPolicyLimits } from "../../services/adminService.js";

const LIMIT_FIELDS = [
  ["minimumAmount", "Minimum amount (₦)"],
  ["maximumPerTransaction", "Maximum per transaction (₦)"],
  ["maximumOutgoingPerDay", "Maximum outgoing per day (₦)"],
  ["maximumOutgoingCountPerDay", "Maximum outgoing transactions per day"],
  ["maximumWalletBalance", "Maximum wallet balance (₦)"],
  ["maximumFundingPerTransaction", "Maximum funding per transaction (₦)"],
  ["maximumFundingPerDay", "Maximum funding per day (₦)"],
  ["maximumWithdrawalPerTransaction", "Maximum withdrawal per transaction (₦)"],
  ["maximumWithdrawalPerDay", "Maximum withdrawal per day (₦)"],
  ["maximumWithdrawalCountPerDay", "Maximum withdrawals per day"],
];

export default function AdminKyc() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [review, setReview] = useState(null);
  const [decision, setDecision] = useState("rejected");
  const [reason, setReason] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState("");
  const [saving, setSaving] = useState(false);
  const [limitDraft, setLimitDraft] = useState({});
  const [limitsPinOpen, setLimitsPinOpen] = useState(false);
  const [limitsPinError, setLimitsPinError] = useState("");

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data: result } = await getAdminKycProfiles();
      setData(result);
      setLimitDraft(Object.fromEntries(result.transactionPolicy.tiers.map((tier) => [
        `tier${tier.tier}`,
        Object.fromEntries(LIMIT_FIELDS.map(([field]) => [field, tier[field] ?? null])),
      ])));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveLimits = async (adminPin) => {
    setSaving(true);
    setLimitsPinError("");
    try {
      await updateTransactionPolicyLimits({ tiers: limitDraft, adminPin });
      toast("Tier limits saved; policy remains inactive pending approval", "success");
      setLimitsPinOpen(false);
      await load();
    } catch (requestError) {
      setLimitsPinError(requestError.response?.data?.message || "Tier limits could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const submitReview = async (adminPin) => {
    if (!review) return;
    setSaving(true);
    setPinError("");
    try {
      await reviewTierThree(review.user._id, { decision, reason, evidenceReference, adminPin });
      toast("Verification review and audit record saved", "success");
      setPinOpen(false);
      setReview(null);
      setReason("");
      setEvidenceReference("");
      await load();
    } catch (requestError) {
      setPinError(requestError.response?.data?.message || "Review could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonCard />;
  if (error) return <ErrorState message="Could not load verification records." onRetry={load} />;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <ShieldCheck className="text-primary-600" size={22} />
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">KYC and transaction policy</h1>
      </div>
      <Card className="border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
        <h2 className="font-semibold text-amber-900 dark:text-amber-200">Policy is fail-closed</h2>
        <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
          Configured: {data.transactionPolicy.configured ? "Yes" : "No"} · Timezone: {data.transactionPolicy.dailyTimeZone || "Unapproved"}.
          No provider checks or tier limits have been approved. Do not enable real-money operations.
        </p>
        <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
          Identity capabilities: BVN, NIN, name/DOB matching, and face/liveness are all unconfigured.
        </p>
      </Card>
      <Card className="border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
        <h2 className="font-semibold text-amber-900 dark:text-amber-200">Configure tier transaction limits</h2>
        <p className="mb-4 mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
          Saving limits clears policy approval and keeps enforcement disabled. This editor cannot approve identity requirements or enable real-money transactions.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {data.transactionPolicy.tiers.map((tier) => (
            <section key={tier.tier} className="rounded-xl border border-amber-200 p-3 dark:border-amber-900">
              <h3 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Tier {tier.tier}</h3>
              <div className="space-y-3">
                {LIMIT_FIELDS.map(([field, label]) => (
                  <Input
                    key={field}
                    label={label}
                    type="number"
                    min={0}
                    step={1}
                    value={limitDraft[`tier${tier.tier}`]?.[field] ?? ""}
                    onChange={(event) => setLimitDraft((current) => ({
                      ...current,
                      [`tier${tier.tier}`]: {
                        ...current[`tier${tier.tier}`],
                        [field]: event.target.value === "" ? null : Number(event.target.value),
                      },
                    }))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        <Button className="mt-4" onClick={() => setLimitsPinOpen(true)}>Save tier limits</Button>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Customer verification status</h2>
        <div className="space-y-3">
          {data.profiles.map(({ user, verification, paystack }) => (
            <div key={user._id} className="rounded-xl border border-borderc p-3 dark:border-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-text-primary dark:text-gray-100">{user.fullName} (@{user.username})</p>
                  <p className="text-xs text-text-secondary dark:text-gray-400">{user.isSuspended ? "Suspended" : "Active"} · Verified tier {verification.currentTier || "none"}</p>
                  <p className="text-xs text-text-secondary dark:text-gray-400">Paystack customer: {paystack?.customerStatus || "not_started"} · Identification: {paystack?.identificationStatus || "not_started"} · Dedicated account: {paystack?.dedicatedAccountStatus || "not_started"}</p>
                </div>
                <p className="text-sm text-text-secondary dark:text-gray-400">Tier 1: {verification.tiers[0].statusLabel} · Tier 2: {verification.tiers[1].statusLabel} · Tier 3: {verification.tiers[2].statusLabel}</p>
              </div>
              {verification.tiers[2].status === "pending" && (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <select value={decision} onChange={(event) => setDecision(event.target.value)} className="rounded-xl border border-borderc bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
                    <option value="verified" disabled={!data.tierRequirementsApproved.tier3}>Approve</option>
                    <option value="rejected">Reject</option>
                    <option value="action_required">Request action</option>
                  </select>
                  <Input placeholder="Reason (no sensitive data)" value={reason} onChange={(event) => setReason(event.target.value)} />
                  <div className="flex gap-2">
                    <Input placeholder="Evidence reference" value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} />
                    <Button size="sm" fullWidth={false} disabled={!reason.trim() || !evidenceReference.trim()} onClick={() => { setReview({ user }); setPinOpen(true); }}>Review</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!data.profiles.length && <p className="text-sm text-text-secondary dark:text-gray-400">No customer accounts found.</p>}
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Recent verification attempts</h2>
        <div className="space-y-2">
          {data.attempts.map((attempt, index) => (
            <div key={`${attempt.user._id}-${attempt.createdAt}-${index}`} className="flex flex-wrap justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
              <span className="text-text-primary dark:text-gray-100">{attempt.user.fullName} (@{attempt.user.username}) · Tier {attempt.requestedTier}</span>
              <span className="text-text-secondary dark:text-gray-400">{attempt.reasonCode} · {new Date(attempt.createdAt).toLocaleString()}</span>
            </div>
          ))}
          {!data.attempts.length && <p className="text-sm text-text-secondary dark:text-gray-400">No verification attempts recorded.</p>}
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Manual review audit trail</h2>
        <div className="space-y-2">
          {data.auditEvents.map((event, index) => (
            <div key={`${event.user._id}-${event.createdAt}-${index}`} className="rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
              <p className="text-text-primary dark:text-gray-100">{event.action} · {event.user.fullName} (@{event.user.username})</p>
              <p className="text-text-secondary dark:text-gray-400">Reviewer: {event.admin.fullName || event.admin.username} · {new Date(event.createdAt).toLocaleString()}</p>
              <p className="text-text-secondary dark:text-gray-400">Reason: {event.reason} · Evidence reference: {event.evidenceReference}</p>
            </div>
          ))}
          {!data.auditEvents.length && <p className="text-sm text-text-secondary dark:text-gray-400">No manual review decisions recorded.</p>}
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold text-text-primary dark:text-gray-100">Funding held for manual resolution</h2>
        <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">These signed provider payments were not credited because the account, verification, or approved funding policy could not be confirmed. Resolve only under an approved operational procedure; never bypass the policy by editing the ledger.</p>
        <div className="space-y-2">
          {data.fundingExceptions.map((item) => (
            <div key={item.paymentReference} className="rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
              <p className="text-text-primary dark:text-gray-100">{item.user ? `${item.user.fullName} (@${item.user.username})` : "Unmatched account"} · ₦{Number(item.amount).toLocaleString()} {item.currency}</p>
              <p className="text-text-secondary dark:text-gray-400">Payment reference: {item.paymentReference} · Reason: {item.reasonCode} · {new Date(item.createdAt).toLocaleString()}</p>
            </div>
          ))}
          {!data.fundingExceptions.length && <p className="text-sm text-text-secondary dark:text-gray-400">No funding exceptions are currently held.</p>}
        </div>
      </Card>
      <PinConfirmModal
        open={pinOpen}
        onClose={() => { setPinOpen(false); setReview(null); }}
        onConfirm={submitReview}
        title="Confirm verification review"
        subtitle="Enter your Admin PIN. The decision and evidence reference will be audit logged."
        loading={saving}
        error={pinError}
      />
      <PinConfirmModal
        open={limitsPinOpen}
        onClose={() => setLimitsPinOpen(false)}
        onConfirm={saveLimits}
        title="Confirm tier-limit update"
        subtitle="Enter your Admin PIN. Saving limits invalidates prior policy approval."
        loading={saving}
        error={limitsPinError}
      />
    </div>
  );
}
