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
import { getElectricityPlans, getVtuQuote, verifyMeter, buyElectricity } from "../../services/vtuService.js";
import { getTransactionByReference } from "../../services/transactionService.js";
import { extractList, normalizeItem } from "../../utils/normalizeVtu.js";

const TYPES = [
  { label: "Prepaid", value: "prepaid" },
  { label: "Postpaid", value: "postpaid" },
];

export default function Electricity() {
  const navigate = useNavigate();
  const toast = useToast();

  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState(null);
  const [type, setType] = useState("prepaid");
  const [meter, setMeter] = useState("");
  const [verifiedName, setVerifiedName] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [amount, setAmount] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pinError, setPinError] = useState("");
  const [quotedPrice, setQuotedPrice] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);

  useEffect(() => {
    getElectricityPlans()
      .then(({ data }) => setPlans(extractList(data)))
      .catch((err) => toast(err.response?.data?.message || "Could not load electricity providers", "error"))
      .finally(() => setLoadingPlans(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setQuotedPrice(null);
    setQuoteError("");
    if (!plan || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return;
    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const product = `${normalizeItem(plan).value}:${type}:${String(Number(amount))}`;
        const { data } = await getVtuQuote({
          service: "electricity",
          provider: "electricity",
          product,
        });
        setQuotedPrice(data.sellingPrice);
      } catch (err) {
        setQuoteError(err.response?.data?.message || "Could not calculate the current electricity price.");
      } finally {
        setQuoting(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [plan, type, amount]);

  useEffect(() => {
    setVerifiedName("");
    setVerifyError("");
    if (!plan || meter.length < 6) return;
    const timer = setTimeout(async () => {
      setVerifying(true);
      try {
        const rawPlan = normalizeItem(plan);
        const { data } = await verifyMeter({ meter, plan: rawPlan.value, type });
        setVerifiedName(data.customer_name || data.customerName || data.name || "Verified");
      } catch (err) {
        setVerifyError(err.response?.data?.message || "Could not verify meter number");
      } finally {
        setVerifying(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [meter, plan, type]);

  const canProceed = plan && verifiedName && Number(amount) > 0 && quotedPrice !== null;

  const handleConfirmPin = async (pin) => {
    setProcessing(true);
    setPinError("");
    try {
      const rawPlan = normalizeItem(plan);
      const { data: purchase } = await buyElectricity({ plan: rawPlan.value, meter, type, amount: Number(amount), pin });
      const transaction = await getTransactionByReference(purchase.reference).catch(() => null);
      const fallback = transaction || { reference: purchase.reference, amount: Number(amount), status: purchase.status || "pending" };
      setPinOpen(false);
      toast(purchase.message || "Electricity token generated", purchase.status === "pending" ? "warning" : "success");
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
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Electricity</h1>
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Distribution Company</label>
            {loadingPlans ? (
              <p className="text-sm text-text-secondary">Loading providers...</p>
            ) : (
              <ItemGrid items={plans} selectedValue={plan ? normalizeItem(plan).value : null} onSelect={setPlan} columns={3} />
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Meter Type</label>
            <div className="flex gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`flex-1 rounded-xl border-2 py-2 text-sm font-medium transition ${
                    type === t.value ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/20" : "border-borderc text-text-secondary dark:border-gray-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Input label="Meter Number" placeholder="Enter meter number" value={meter} onChange={(e) => setMeter(e.target.value)} />
            {verifying && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-secondary"><Spinner size={12} /> Verifying meter...</p>}
            {!verifying && verifiedName && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-success"><CheckCircle2 size={14} /> {verifiedName}</p>
            )}
            {!verifying && verifyError && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-error"><XCircle size={14} /> {verifyError}</p>
            )}
          </div>

          <Input label="Amount" type="number" placeholder="₦0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {quoting && <p className="text-xs text-text-secondary">Calculating current selling price...</p>}
          {!quoting && quotedPrice !== null && (
            <p className="text-sm font-medium text-text-primary dark:text-gray-100">
              Your price: ₦{Number(quotedPrice).toLocaleString()}
            </p>
          )}
          {!quoting && quoteError && <p className="text-xs text-error">{quoteError}</p>}

          <Button disabled={!canProceed} onClick={() => setPinOpen(true)}>Continue</Button>
        </div>
      </Card>

      <PinConfirmModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onConfirm={handleConfirmPin}
        loading={processing}
        error={pinError}
        subtitle={`Buy ₦${Number(amount || 0).toLocaleString()} token for ${verifiedName}`}
      />
    </div>
  );
}
