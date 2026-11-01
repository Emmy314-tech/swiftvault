import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Toggle from "../../components/ui/Toggle.jsx";
import { SkeletonCard } from "../../components/ui/Skeleton.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getBusinessSettings, updateServiceToggles } from "../../services/adminService.js";

const LABELS = {
  data: "Data",
  airtime: "Airtime",
  cable: "Cable TV",
  electricity: "Electricity",
  epin: "Recharge Card",
  education: "Education",
  betting: "Betting",
  walletTransfer: "SwiftVault Transfer",
  walletFunding: "Wallet Funding",
};

export default function ServiceToggles() {
  const toast = useToast();
  const [services, setServices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(null); // { key, value }
  const [pinError, setPinError] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getBusinessSettings();
      setServices(data.settings.services);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleConfirmPin = async (adminPin) => {
    const { key, value } = pendingToggle;
    setProcessing(true);
    setPinError("");
    const prev = services;
    try {
      await updateServiceToggles({ services: { [key]: value }, adminPin });
      setServices({ ...services, [key]: value });
      toast(`${LABELS[key]} ${value ? "enabled" : "disabled"}`, "success");
      setPendingToggle(null);
    } catch (err) {
      setServices(prev);
      setPinError(err.response?.data?.message || "Failed to update");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <SkeletonCard />;
  if (error) return <ErrorState message="Could not load service settings." onRetry={load} />;

  return (
    <div className="mx-auto max-w-lg space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/admin/business-control" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Service Enable/Disable</h1>
      </div>

      <Card>
        <div className="divide-y divide-borderc dark:divide-gray-800">
          {Object.keys(LABELS).map((key) => (
            <Toggle
              key={key}
              checked={services[key] !== false}
              onChange={(v) => setPendingToggle({ key, value: v })}
              label={LABELS[key]}
            />
          ))}
        </div>
      </Card>

      <p className="text-center text-xs text-text-secondary dark:text-gray-500">
        Changes apply immediately - users attempting a disabled service see a maintenance message.
      </p>

      <PinConfirmModal
        open={!!pendingToggle}
        onClose={() => setPendingToggle(null)}
        onConfirm={handleConfirmPin}
        loading={processing}
        error={pinError}
        title="Confirm with Admin PIN"
        subtitle="Confirm this service change with your Admin PIN"
      />
    </div>
  );
}
