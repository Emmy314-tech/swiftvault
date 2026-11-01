import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, User, CheckCircle2, XCircle } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import { Spinner } from "../../components/ui/Spinner.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import {
  lookupRecipient,
  sendMoney,
  getBeneficiaries,
} from "../../services/transferService.js";
import { getTransactions } from "../../services/transactionService.js";

export default function SwiftVaultTransfer() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [phone, setPhone] = useState(location.state?.phone || "");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [recipient, setRecipient] = useState(null);
  const [checking, setChecking] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [pinOpen, setPinOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    getBeneficiaries()
      .then(({ data }) => setBeneficiaries(data.beneficiaries || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!phone || phone.length < 10) {
      setRecipient(null);
      return;
    }
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const { data } = await lookupRecipient(phone);
        setRecipient(data.exists ? data : { exists: false });
      } catch {
        setRecipient({ exists: false });
      } finally {
        setChecking(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [phone]);

  const canProceed = recipient?.exists && Number(amount) > 0;

  const handleConfirmPin = async (pin) => {
    setProcessing(true);
    setPinError("");
    try {
      const { data } = await sendMoney({ phone, amount: Number(amount), pin, narration });

      // Backend doesn't return fee/full transaction details in this response,
      // so we look up the real transaction record for an accurate receipt.
      let transaction = null;
      try {
        const { data: txList } = await getTransactions();
        transaction = txList.find((t) => t.reference === data.reference) || null;
      } catch {
        /* receipt will fall back to summary-only view */
      }

      setPinOpen(false);
      toast("Transfer completed successfully", "success");
      navigate(`/receipt/${data.reference}`, {
        state: { transaction, fallback: { reference: data.reference, amount: Number(amount), status: "success" } },
      });
    } catch (err) {
      setPinError(err.response?.data?.message || "Transfer failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/wallet" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">SwiftVault Transfer</h1>
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <Input
              label="Recipient Phone Number"
              placeholder="Enter phone number"
              icon={User}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {checking && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-secondary">
                <Spinner size={12} /> Checking recipient...
              </p>
            )}
            {!checking && recipient?.exists && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-success">
                <CheckCircle2 size={14} /> {recipient.fullName} (@{recipient.username})
              </p>
            )}
            {!checking && recipient && !recipient.exists && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-error">
                <XCircle size={14} /> No SwiftVault user found with this number
              </p>
            )}
          </div>

          {beneficiaries.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-text-secondary dark:text-gray-400">Recent recipients</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {beneficiaries.slice(0, 8).map((b) => (
                  <button
                    key={b._id}
                    onClick={() => setPhone(b.phone)}
                    className="shrink-0 rounded-xl border border-borderc px-3 py-2 text-left dark:border-gray-700"
                  >
                    <p className="text-xs font-medium text-text-primary dark:text-gray-100">{b.name.split(" ")[0]}</p>
                    <p className="text-[11px] text-text-secondary dark:text-gray-400">{b.phone}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Input
            label="Amount"
            type="number"
            placeholder="₦0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            label="Narration (optional)"
            placeholder="What's this for?"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
          />

          <p className="text-xs text-text-secondary dark:text-gray-400">
            SwiftVault-to-SwiftVault transfers have no transfer fee.
          </p>

          <Button disabled={!canProceed} onClick={() => setPinOpen(true)}>
            Continue
          </Button>
        </div>
      </Card>

      <PinConfirmModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onConfirm={handleConfirmPin}
        loading={processing}
        error={pinError}
        subtitle={`Send ₦${Number(amount || 0).toLocaleString()} to ${recipient?.fullName || "recipient"}`}
      />
    </div>
  );
}
