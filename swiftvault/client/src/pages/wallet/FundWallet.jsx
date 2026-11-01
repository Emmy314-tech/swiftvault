import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, ShieldCheck } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import { SkeletonCard } from "../../components/ui/Skeleton.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { assignPaystackDedicatedAccount, getPaystackDedicatedAccount, getPaystackFundingStatus, initializePaystackFunding, verifyPaystackFunding } from "../../services/fundingService.js";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";

export default function FundWallet() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [paystackEnabled, setPaystackEnabled] = useState(false);
  const [paystackAccount, setPaystackAccount] = useState(null);
  const [paystackAccountError, setPaystackAccountError] = useState("");
  const [paystackConsent, setPaystackConsent] = useState(false);
  const [paystackAccountPinOpen, setPaystackAccountPinOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [fundingError, setFundingError] = useState("");
  const [fundingMessage, setFundingMessage] = useState("");
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [fundingLoading, setFundingLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [paystackResponse, paystackAccountResponse] = await Promise.allSettled([
        getPaystackFundingStatus(),
        getPaystackDedicatedAccount(),
      ]);
      if (paystackResponse.status === "fulfilled") setPaystackEnabled(paystackResponse.value.data.enabled === true);
      if (paystackAccountResponse.status === "fulfilled") setPaystackAccount(paystackAccountResponse.value.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");
    if (!reference) return;
    setFundingMessage("Checking payment with the server...");
    verifyPaystackFunding(reference)
      .then(({ data }) => setFundingMessage(data.message || `Payment status: ${data.status || "received"}.`))
      .catch((verifyError) => setFundingMessage(verifyError.response?.data?.message || "Payment is not confirmed yet. Refresh this page to check again."));
  }, []);

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    toast(`${label} copied`, "success");
  };

  const beginFunding = () => {
    setFundingError("");
    setFundingMessage("");
    setPinModalOpen(true);
  };

  const confirmFundingPin = async (pin) => {
    setFundingLoading(true);
    setFundingError("");
    try {
      const { data } = await initializePaystackFunding({ amount, pin });
      if (!data.authorizationUrl || !data.reference) throw new Error("Payment checkout could not be opened.");
      setPinModalOpen(false);
      window.location.assign(data.authorizationUrl);
    } catch (initError) {
      setFundingError(initError.response?.data?.message || initError.message || "Payment could not be initialized.");
    } finally {
      setFundingLoading(false);
    }
  };

  const confirmPaystackAccountPin = async (pin) => {
    setFundingLoading(true);
    setPaystackAccountError("");
    try {
      const { data } = await assignPaystackDedicatedAccount({ consent: true, pin });
      setPaystackAccount(data);
      setPaystackAccountPinOpen(false);
      setPaystackConsent(false);
    } catch (requestError) {
      setPaystackAccountError(requestError.response?.data?.message || "Paystack account assignment could not be completed.");
    } finally {
      setFundingLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/wallet" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Fund Wallet</h1>
      </div>

      {loading && <SkeletonCard />}
      {error && <ErrorState message="Could not set up your funding account." onRetry={load} />}

      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck size={19} className="mt-0.5 shrink-0 text-primary-600" />
          <div className="w-full space-y-3">
            <div>
              <h2 className="font-semibold text-text-primary dark:text-gray-100">Paystack</h2>
              <p className="text-sm text-text-secondary dark:text-gray-400">
                {paystackEnabled ? "Secure online wallet funding" : "Online wallet funding is currently unavailable"}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="number"
                min="1"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Amount in NGN"
                aria-label="Funding amount in naira"
                disabled={!paystackEnabled || fundingLoading}
              />
              <Button onClick={beginFunding} disabled={!paystackEnabled || !amount || fundingLoading} loading={fundingLoading}>
                Continue
              </Button>
            </div>
            {fundingError && <p role="alert" className="text-sm text-danger-600">{fundingError}</p>}
            {fundingMessage && <p role="status" className="text-sm text-text-secondary dark:text-gray-300">{fundingMessage}</p>}
          </div>
        </div>
      </Card>

      {paystackAccount && (
        <Card>
          <div className="space-y-3">
            <div>
              <h2 className="font-semibold text-text-primary dark:text-gray-100">Paystack bank transfer account</h2>
              <p className="text-sm text-text-secondary dark:text-gray-400">
                Account: {paystackAccount.accountStatus} · Customer: {paystackAccount.customerStatus} · Identification: {paystackAccount.identificationStatus}
              </p>
            </div>
            {paystackAccount.accountStatus === "active" && paystackAccount.account && (
              <div className="divide-y divide-borderc dark:divide-gray-800">
                <Row label="Bank Name" value={paystackAccount.account.bankName} onCopy={() => copy(paystackAccount.account.bankName, "Bank name")} />
                <Row label="Account Name" value={paystackAccount.account.accountName} onCopy={() => copy(paystackAccount.account.accountName, "Account name")} />
                <Row label="Account Number" value={paystackAccount.account.accountNumber} onCopy={() => copy(paystackAccount.account.accountNumber, "Account number")} />
              </div>
            )}
            {paystackAccount.accountStatus !== "active" && (
              <p className="text-sm text-text-secondary dark:text-gray-400">
                {paystackAccount.blockReason
                  ? "Assignment is unavailable until your existing verification and approved funding policy allow it."
                  : "Dedicated account assignment is being processed."}
              </p>
            )}
            {paystackAccount.canAssign && (
              <>
                <label className="flex items-start gap-2 text-sm text-text-secondary dark:text-gray-300">
                  <input type="checkbox" checked={paystackConsent} onChange={(event) => setPaystackConsent(event.target.checked)} />
                  <span>I consent to SwiftVault sharing my existing profile details with Paystack for account assignment.</span>
                </label>
                <Button onClick={() => setPaystackAccountPinOpen(true)} disabled={!paystackConsent || fundingLoading} loading={fundingLoading}>
                  Assign Paystack account
                </Button>
              </>
            )}
            {paystackAccountError && <p role="alert" className="text-sm text-danger-600">{paystackAccountError}</p>}
          </div>
        </Card>
      )}

      <PinConfirmModal
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onConfirm={confirmFundingPin}
        loading={fundingLoading}
        error={fundingError}
        title="Confirm Wallet Funding"
        subtitle="Enter your transaction PIN to continue. You will also verify this action with your password or passkey."
      />
      <PinConfirmModal
        open={paystackAccountPinOpen}
        onClose={() => setPaystackAccountPinOpen(false)}
        onConfirm={confirmPaystackAccountPin}
        loading={fundingLoading}
        error={paystackAccountError}
        title="Confirm Paystack account assignment"
        subtitle="Enter your transaction PIN and confirm the account assignment request."
      />
    </div>
  );
}

function Row({ label, value, onCopy }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <div>
        <p className="text-xs text-text-secondary dark:text-gray-400">{label}</p>
        <p className="text-sm font-medium text-text-primary dark:text-gray-100">{value}</p>
      </div>
      <button onClick={onCopy} aria-label={`Copy ${label}`} className="text-primary-600">
        <Copy size={16} />
      </button>
    </div>
  );
}
