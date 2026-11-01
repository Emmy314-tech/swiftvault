import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { SkeletonCard } from "../../components/ui/Skeleton.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getBusinessSettings, updateUpgradeFees } from "../../services/adminService.js";

export default function MembershipSettings() {
  const toast = useToast();
  const [upgradeFee, setUpgradeFee] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState("");

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getBusinessSettings();
      setUpgradeFee(String(data.settings.upgradeFee));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveFee = async (adminPin) => {
    setSaving(true);
    setPinError("");
    try {
      await updateUpgradeFees({ upgradeFee: Number(upgradeFee), adminPin });
      toast("Upgrade fee updated", "success");
      setPinOpen(false);
      await load();
    } catch (requestError) {
      setPinError(requestError.response?.data?.message || "Could not update upgrade fee");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonCard />;
  if (error) return <ErrorState message="Could not load membership settings." onRetry={load} />;

  return (
    <div className="mx-auto max-w-lg space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/admin/business-control" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Upgrade Membership Rules</h1>
      </div>
      <Card>
        <div className="mb-4 space-y-3">
          <Input
            label="SwiftVault upgrade fee (₦)"
            type="number"
            min={1500}
            step={1}
            value={upgradeFee}
            onChange={(event) => setUpgradeFee(event.target.value)}
          />
          <p className="text-xs text-text-secondary dark:text-gray-400">
            This is SwiftVault's membership fee, not Peyflex's separate yearly top-reseller fee. The current fee is charged only after wallet payment and transaction PIN verification. The eligible referrer commission remains ₦1,500; without an eligible upgraded referrer, the company receives the full fee.
          </p>
          <Button onClick={() => setPinOpen(true)}>Save Fee</Button>
        </div>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="font-semibold text-text-primary dark:text-gray-100">Upgrade fee</dt>
            <dd className="mt-1 text-text-secondary dark:text-gray-400">₦{Number(upgradeFee).toLocaleString()}, paid from the user's wallet.</dd>
          </div>
          <div>
            <dt className="font-semibold text-text-primary dark:text-gray-100">Company allocation</dt>
            <dd className="mt-1 text-text-secondary dark:text-gray-400">₦{Math.max(0, Number(upgradeFee) - 1500).toLocaleString()} when an upgraded referrer is eligible; otherwise the company retains all ₦{Number(upgradeFee).toLocaleString()}.</dd>
          </div>
          <div>
            <dt className="font-semibold text-text-primary dark:text-gray-100">Referral reward</dt>
            <dd className="mt-1 text-text-secondary dark:text-gray-400">₦1,500 only when the referrer is already upgraded at payment confirmation.</dd>
          </div>
          <div>
            <dt className="font-semibold text-text-primary dark:text-gray-100">Tier and pricing</dt>
            <dd className="mt-1 text-text-secondary dark:text-gray-400">An upgrade never changes tier. Upgraded VTU prices remain disabled until the separate schedule is configured and enabled in Dynamic Pricing.</dd>
          </div>
        </dl>
      </Card>
      <PinConfirmModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onConfirm={saveFee}
        loading={saving}
        error={pinError}
        title="Confirm with Admin PIN"
        subtitle="Save the SwiftVault membership fee"
      />
    </div>
  );
}
