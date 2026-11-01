import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import ItemGrid from "../../components/vtu/ItemGrid.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { Wifi } from "lucide-react";
import { Spinner } from "../../components/ui/Spinner.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getNetworks, getPlans, buyData } from "../../services/vtuService.js";
import { getTransactionByReference } from "../../services/transactionService.js";
import { extractList, normalizeItem } from "../../utils/normalizeVtu.js";

export default function Data() {
  const navigate = useNavigate();
  const toast = useToast();

  const [networks, setNetworks] = useState([]);
  const [network, setNetwork] = useState(null);
  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState(null);
  const [loadingNetworks, setLoadingNetworks] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [phone, setPhone] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    getNetworks()
      .then(({ data }) => setNetworks(extractList(data)))
      .catch((err) => toast(err.response?.data?.message || "Could not load networks", "error"))
      .finally(() => setLoadingNetworks(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!network) return;
    setPlan(null);
    setLoadingPlans(true);
    getPlans({ network: network.value })
      .then(({ data }) => setPlans(extractList(data)))
      .catch((err) => toast(err.response?.data?.message || "Could not load data plans", "error"))
      .finally(() => setLoadingPlans(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  const canProceed = network && plan && normalizeItem(plan.raw || plan).price !== null && phone.length >= 10;

  const handleConfirmPin = async (pin) => {
    setProcessing(true);
    setPinError("");
    try {
      const rawPlan = normalizeItem(plan.raw || plan);
      const { data: purchase } = await buyData({ network: network.value, plan_code: rawPlan.value, mobile_number: phone, pin });
      const transaction = await getTransactionByReference(purchase.reference).catch(() => null);
      const fallback = transaction || { reference: purchase.reference, amount: rawPlan.price || 0, status: purchase.status || "pending" };
      setPinOpen(false);
      toast(purchase.message || "Data purchase successful", purchase.status === "pending" ? "warning" : "success");
      navigate(`/receipt/${purchase.reference}`, { state: { transaction, fallback } });
    } catch (err) {
      setPinError(err.response?.data?.message || "Purchase failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/vtu" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Buy Data</h1>
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Network</label>
            {loadingNetworks ? (
              <p className="text-sm text-text-secondary">Loading networks...</p>
            ) : (
              <ItemGrid items={networks} selectedValue={network?.value} onSelect={setNetwork} />
            )}
          </div>

          {network && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Data Plan</label>
              {loadingPlans ? (
                <div className="flex items-center gap-2 text-sm text-text-secondary"><Spinner size={14} /> Loading plans...</div>
              ) : plans.length === 0 ? (
                <EmptyState icon={Wifi} title="No plans available" description="Try a different network." />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {plans.map((raw) => {
                    const p = normalizeItem(raw);
                    const isSelected = plan && normalizeItem(plan).value === p.value;
                    return (
                      <button
                        key={p.value}
                        disabled={p.price === null}
                        onClick={() => setPlan(raw)}
                        className={`rounded-xl border-2 p-3 text-left transition ${
                          isSelected ? "border-primary-600 bg-primary-50 dark:bg-primary-900/20" : "border-borderc dark:border-gray-700"
                        }`}
                      >
                        <p className="text-sm font-semibold text-text-primary dark:text-gray-100">{p.label}</p>
                        {p.price != null
                          ? <p className="text-xs text-primary-600">₦{Number(p.price).toLocaleString()}</p>
                          : <p className="text-xs text-error">Price unavailable; provider cost needs admin verification</p>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <Input label="Phone Number" placeholder="Enter phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />

          <Button disabled={!canProceed} onClick={() => setPinOpen(true)}>Continue</Button>
        </div>
      </Card>

      <PinConfirmModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onConfirm={handleConfirmPin}
        loading={processing}
        error={pinError}
        subtitle={plan ? `Buy ${normalizeItem(plan).label} for ${phone}` : ""}
      />
    </div>
  );
}
