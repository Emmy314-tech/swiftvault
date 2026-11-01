import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import ItemGrid from "../../components/vtu/ItemGrid.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getEducationProviders, getVtuQuote, buyEducationPin } from "../../services/vtuService.js";
import { getTransactionByReference } from "../../services/transactionService.js";
import { extractList, normalizeItem } from "../../utils/normalizeVtu.js";

export default function Education() {
  const navigate = useNavigate();
  const toast = useToast();

  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pinOpen, setPinOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pinError, setPinError] = useState("");
  const [quotedPrice, setQuotedPrice] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);

  useEffect(() => {
    getEducationProviders()
      .then(({ data }) => setProviders(extractList(data)))
      .catch((err) => toast(err.response?.data?.message || "Could not load exam providers", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setQuotedPrice(null);
    setQuoteError("");
    if (!provider || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1) return;
    let active = true;
    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const { data } = await getVtuQuote({
          service: "education",
          provider: normalizeItem(provider).value,
          product: "pin",
          units: Number(quantity),
        });
        if (active) setQuotedPrice(data.sellingPrice);
      } catch (err) {
        if (active) setQuoteError(err.response?.data?.message || "Could not calculate the current exam PIN price.");
      } finally {
        if (active) setQuoting(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [provider, quantity]);

  const canProceed = provider && quotedPrice !== null && quantity >= 1;

  const handleConfirmPin = async (pin) => {
    setProcessing(true);
    setPinError("");
    try {
      const item = normalizeItem(provider);
      const { data } = await buyEducationPin({ provider: item.value, quantity, pin });
      const transaction = await getTransactionByReference(data.reference).catch(() => null);
      const fallback = transaction || { reference: data.reference, amount: Number(quotedPrice), status: data.status || "pending" };
      setPinOpen(false);
      toast(data.message || "Exam PIN(s) generated", data.status === "pending" ? "warning" : "success");
      navigate(`/receipt/${data.reference}`, {
        state: { transaction, fallback, examData: data.status === "pending" ? null : data.data },
      });
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
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Education / Exam PIN</h1>
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Exam Board</label>
            {loading ? (
              <p className="text-sm text-text-secondary">Loading providers...</p>
            ) : (
              <ItemGrid items={providers} selectedValue={provider ? normalizeItem(provider).value : null} onSelect={setProvider} columns={2} />
            )}
          </div>

          <Input
            label="Quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
          />

          {quoting && <p className="text-xs text-text-secondary">Calculating current selling price...</p>}
          {!quoting && quotedPrice !== null && (
            <p className="text-sm font-medium text-text-primary dark:text-gray-100">
              Total price: ₦{Number(quotedPrice).toLocaleString()}
            </p>
          )}
          {!quoting && quoteError && <p className="text-xs text-error">{quoteError}</p>}

          <Button disabled={!canProceed} onClick={() => setPinOpen(true)}>Purchase PIN(s)</Button>
        </div>
      </Card>

      <PinConfirmModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onConfirm={handleConfirmPin}
        loading={processing}
        error={pinError}
        subtitle={`Buy ${quantity}x exam PIN(s) - ₦${Number(quotedPrice || 0).toLocaleString()} total`}
      />
    </div>
  );
}
