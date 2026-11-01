import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import ItemGrid from "../../components/vtu/ItemGrid.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { buyEpin, getVtuQuote } from "../../services/vtuService.js";
import { getTransactionByReference } from "../../services/transactionService.js";

const NETWORKS = ["MTN", "AIRTEL", "GLO", "9MOBILE"];
const DENOMINATIONS = [100, 200, 300, 500];

export default function RechargeCard() {
  const navigate = useNavigate();
  const toast = useToast();

  const [network, setNetwork] = useState(null);
  const [amount, setAmount] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [pinOpen, setPinOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pinError, setPinError] = useState("");
  const [quotedPrice, setQuotedPrice] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);

  useEffect(() => {
    setQuotedPrice(null);
    setQuoteError("");
    if (!network || !amount || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1) return;
    let active = true;
    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const { data } = await getVtuQuote({
          service: "epin",
          provider: network.value,
          product: String(Number(amount)),
          units: Number(quantity),
        });
        if (active) setQuotedPrice(data.sellingPrice);
      } catch (err) {
        if (active) setQuoteError(err.response?.data?.message || "Could not calculate the current ePIN price.");
      } finally {
        if (active) setQuoting(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [network, amount, quantity]);

  const canProceed = network && amount && quantity >= 1 && quotedPrice !== null;

  const handleConfirmPin = async (pin) => {
    setProcessing(true);
    setPinError("");
    try {
      const { data } = await buyEpin({ network: network.value, amount, quantity, pin });
      const transaction = await getTransactionByReference(data.reference).catch(() => null);
      const fallback = transaction || { reference: data.reference, amount: Number(amount) * quantity, status: data.status || "pending" };
      setPinOpen(false);
      toast(data.message || "Recharge card(s) generated successfully", data.status === "pending" ? "warning" : "success");
      navigate(`/receipt/${data.reference}`, {
        state: { transaction, fallback, cards: data.status === "pending" ? [] : data.cards || [] },
      });
    } catch (err) {
      setPinError(err.response?.data?.message || "Generation failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/vtu" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Recharge Card Printing</h1>
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Network</label>
            <ItemGrid items={NETWORKS} selectedValue={network?.value} onSelect={setNetwork} />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Denomination</label>
            <div className="grid grid-cols-4 gap-2">
              {DENOMINATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setAmount(d)}
                  className={`rounded-xl border-2 py-2 text-sm font-semibold transition ${
                    amount === d ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/20" : "border-borderc text-text-secondary dark:border-gray-700"
                  }`}
                >
                  ₦{d}
                </button>
              ))}
            </div>
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

          <p className="text-xs text-text-secondary dark:text-gray-400">
            Custom business-name branding is not enabled. The provider receives no reseller brand name.
          </p>

          <Button disabled={!canProceed} onClick={() => setPinOpen(true)}>Generate Cards</Button>
        </div>
      </Card>

      <PinConfirmModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onConfirm={handleConfirmPin}
        loading={processing}
        error={pinError}
        subtitle={`Generate ${quantity}x ₦${amount || 0} ${network?.label || ""} recharge card(s)`}
      />
    </div>
  );
}
