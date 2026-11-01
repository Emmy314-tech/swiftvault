import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import ItemGrid from "../../components/vtu/ItemGrid.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getAirtimeNetworks, getVtuQuote, buyAirtime } from "../../services/vtuService.js";
import { getTransactionByReference } from "../../services/transactionService.js";
import { extractList } from "../../utils/normalizeVtu.js";

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

export default function Airtime() {
  const navigate = useNavigate();
  const toast = useToast();

  const [networks, setNetworks] = useState([]);
  const [network, setNetwork] = useState(null);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [loadingNetworks, setLoadingNetworks] = useState(true);
  const [pinOpen, setPinOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pinError, setPinError] = useState("");
  const [quotedPrice, setQuotedPrice] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);

  useEffect(() => {
    getAirtimeNetworks()
      .then(({ data }) => setNetworks(extractList(data)))
      .catch((err) => toast(err.response?.data?.message || "Could not load networks", "error"))
      .finally(() => setLoadingNetworks(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setQuotedPrice(null);
    setQuoteError("");
    if (!network || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return;

    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const { data } = await getVtuQuote({
          service: "airtime",
          provider: network.value,
          product: String(Number(amount)),
        });
        setQuotedPrice(data.sellingPrice);
      } catch (err) {
        setQuoteError(err.response?.data?.message || "Could not calculate the current airtime price.");
      } finally {
        setQuoting(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [network, amount]);

  const canProceed = network && phone.length >= 10 && Number(amount) > 0 && quotedPrice !== null;

  const handleConfirmPin = async (pin) => {
    setProcessing(true);
    setPinError("");
    try {
      const { data: purchase } = await buyAirtime({ network: network.value, mobile_number: phone, amount: Number(amount), pin });
      const transaction = await getTransactionByReference(purchase.reference).catch(() => null);
      const fallback = transaction || { reference: purchase.reference, amount: Number(amount), status: purchase.status || "pending" };
      setPinOpen(false);
      toast(purchase.message || "Airtime purchase successful", purchase.status === "pending" ? "warning" : "success");
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
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Buy Airtime</h1>
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

          <Input
            label="Phone Number"
            placeholder="Enter phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Amount</label>
            <div className="mb-2 grid grid-cols-3 gap-2">
              {QUICK_AMOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAmount(String(a))}
                  className={`rounded-xl border-2 py-2 text-sm font-semibold transition ${
                    Number(amount) === a
                      ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/20"
                      : "border-borderc text-text-secondary dark:border-gray-700"
                  }`}
                >
                  ₦{a.toLocaleString()}
                </button>
              ))}
            </div>
            <Input type="number" placeholder="Or enter custom amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {quoting && <p className="mt-2 text-xs text-text-secondary">Calculating current selling price...</p>}
            {!quoting && quotedPrice !== null && (
              <p className="mt-2 text-sm font-medium text-text-primary dark:text-gray-100">
                Your price: ₦{Number(quotedPrice).toLocaleString()}
              </p>
            )}
            {!quoting && quoteError && <p className="mt-2 text-xs text-error">{quoteError}</p>}
          </div>

          <Button disabled={!canProceed} onClick={() => setPinOpen(true)}>Continue</Button>
        </div>
      </Card>

      <PinConfirmModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onConfirm={handleConfirmPin}
        loading={processing}
        error={pinError}
        subtitle={`Buy ₦${Number(amount || 0).toLocaleString()} airtime for ${phone}`}
      />
    </div>
  );
}
