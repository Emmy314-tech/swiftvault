import { ShieldCheck, Crown } from "lucide-react";
import Card from "../ui/Card.jsx";
import Badge from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import PinConfirmModal from "../wallet/PinConfirmModal.jsx";
import { useEffect, useState } from "react";
import { useToast } from "../../context/ToastContext.jsx";
import { getUpgradeFee, purchaseUpgrade } from "../../services/upgradeService.js";

const TIER_LABEL = { normal: "Normal", retail: "Retail", wholesale: "Wholesale" };

export default function MembershipStatus({ tier = "normal", isUpgraded = false, businessName, onUpgrade }) {
  const toast = useToast();
  const [pinOpen, setPinOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pinError, setPinError] = useState("");
  const [upgradeFee, setUpgradeFee] = useState(null);
  const [upgradeFeeError, setUpgradeFeeError] = useState("");

  useEffect(() => {
    getUpgradeFee()
      .then(({ data }) => setUpgradeFee(data.upgradeFee))
      .catch((error) => setUpgradeFeeError(
        error.response?.data?.message || "Upgrade fee is currently unavailable."
      ));
  }, []);

  const confirmUpgrade = async (pin) => {
    setProcessing(true);
    setPinError("");
    try {
      await purchaseUpgrade({ pin });
      setPinOpen(false);
      toast("Account upgraded successfully", "success");
      await onUpgrade?.();
    } catch (error) {
      setPinError(error.response?.data?.message || "Upgrade could not be completed.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
            {isUpgraded ? <Crown size={17} /> : <ShieldCheck size={17} />}
          </div>
          <div className="space-y-1">
            <p className="text-xs text-text-secondary dark:text-gray-400">Tier</p>
            <Badge variant={tier === "normal" ? "neutral" : "info"}>{TIER_LABEL[tier] || tier}</Badge>
          </div>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-xs text-text-secondary dark:text-gray-400">Upgrade Status</p>
          <Badge variant={isUpgraded ? "primary" : "neutral"}>{isUpgraded ? "Upgraded User" : "Normal User"}</Badge>
        </div>
      </div>
      {!isUpgraded && (
        <Button className="mt-4 w-full" disabled={upgradeFee === null} onClick={() => setPinOpen(true)}>
          {upgradeFee === null ? "Upgrade fee unavailable" : `Upgrade for ₦${Number(upgradeFee).toLocaleString()}`}
        </Button>
      )}
      {upgradeFeeError && !isUpgraded && (
        <p className="mt-2 text-xs text-error">{upgradeFeeError}</p>
      )}
      {businessName && (
        <p className="mt-2 text-xs text-text-secondary dark:text-gray-400">Business: {businessName}</p>
      )}
      <PinConfirmModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onConfirm={confirmUpgrade}
        loading={processing}
        error={pinError}
        title="Confirm Account Upgrade"
        subtitle={`${upgradeFee === null ? "The configured upgrade fee" : `₦${Number(upgradeFee).toLocaleString()}`} will be deducted from your wallet. Your tier will not change.`}
      />
    </Card>
  );
}
