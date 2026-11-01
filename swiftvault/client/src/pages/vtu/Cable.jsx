import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import ItemGrid from "../../components/vtu/ItemGrid.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { Spinner } from "../../components/ui/Spinner.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getCableProviders, getCablePlans, verifyDecoder, buyCable } from "../../services/vtuService.js";
import { getTransactionByReference } from "../../services/transactionService.js";
import { extractList, normalizeItem } from "../../utils/normalizeVtu.js";

export default function Cable() {
  const navigate = useNavigate();
  const toast = useToast();

  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState(null);
  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState(null);
  const [smartCard, setSmartCard] = useState("");
  const [verifiedName, setVerifiedName] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [pinOpen, setPinOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    getCableProviders()
      .then(({ data }) => setProviders(extractList(data)))
      .catch((err) => toast(err.response?.data?.message || "Could not load cable providers", "error"))
      .finally(() => setLoadingProviders(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!provider) return;
    setPlan(null);
    getCablePlans({ provider: provider.value })
      .then(({ data }) => setPlans(extractList(data)))
      .catch((err) => toast(err.response?.data?.message || "Could not load plans", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  useEffect(() => {
    setVerifiedName("");
    setVerifyError("");
    if (!provider || smartCard.length < 8) return;
    const timer = setTimeout(async () => {
      setVerifying(true);
      try {
        const { data } = await verifyDecoder({ provider: provider.value, smart_card_number: smartCard });
        const name = data.customer_name || data.customerName || data.name || "Verified";
        setVerifiedName(name);
      } catch (err) {
        setVerifyError(err.response?.data?.message || "Could not verify smart card number");
      } finally {
        setVerifying(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [smartCard, provider]);

  const canProceed = provider && plan && normalizeItem(plan).price !== null && verifiedName;

  const handleConfirmPin = async (pin) => {
    setProcessing(true);
    setPinError("");
    try {
      const rawPlan = normalizeItem(plan);
      const { data: purchase } = await buyCable({ provider: provider.value, smart_card_number: smartCard, plan_code: rawPlan.value, pin });
      const transaction = await getTransactionByReference(purchase.reference).catch(() => null);
      const fallback = transaction || { reference: purchase.reference, amount: rawPlan.price || 0, status: purchase.status || "pending" };
      setPinOpen(false);
      toast(purchase.message || "Cable subscription successful", purchase.status === "pending" ? "warning" : "success");
      navigate(`/receipt/${purchase.reference}`, { state: { transaction, fallback } });
    } catch (err) {
      setPinError(err.response?.data?.message || "Subscription failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/vtu" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Cable TV</h1>
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Provider</label>
            {loadingProviders ? (
              <p className="text-sm text-text-secondary">Loading providers...</p>
            ) : (
              <ItemGrid items={providers} selectedValue={provider?.value} onSelect={setProvider} columns={3} />
            )}
          </div>

          {provider && (
            <div>
              <Input
                label="Smart Card / IUC Number"
                placeholder="Enter smart card number"
                value={smartCard}
                onChange={(e) => setSmartCard(e.target.value)}
              />
              {verifying && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-secondary"><Spinner size={12} /> Verifying...</p>}
              {!verifying && verifiedName && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-success"><CheckCircle2 size={14} /> {verifiedName}</p>
              )}
              {!verifying && verifyError && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-error"><XCircle size={14} /> {verifyError}</p>
              )}
            </div>
          )}

          {provider && plans.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Bouquet</label>
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
            </div>
          )}

          <Button disabled={!canProceed} onClick={() => setPinOpen(true)}>Continue</Button>
        </div>
      </Card>

      <PinConfirmModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onConfirm={handleConfirmPin}
        loading={processing}
        error={pinError}
        subtitle={plan ? `Subscribe ${normalizeItem(plan).label} for ${verifiedName}` : ""}
      />
    </div>
  );
}
