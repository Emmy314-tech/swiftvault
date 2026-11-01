import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import CodeInput from "../../components/ui/CodeInput.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { setAdminPin } from "../../services/adminService.js";
import { getProfile } from "../../services/userService.js";

export default function AdminPinSetup() {
  const navigate = useNavigate();
  const toast = useToast();
  const [firstPin, setFirstPin] = useState(null);
  const [step, setStep] = useState("loading");
  const [hasPin, setHasPin] = useState(false);
  const [currentPin, setCurrentPin] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    let active = true;
    getProfile()
      .then(({ data }) => {
        if (active) {
          const configured = Boolean(data.hasAdminPin);
          setHasPin(configured);
          setStep(configured ? "current" : "new");
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.response?.data?.message || "Unable to check your Admin PIN status.");
          setStep("error");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleComplete = async (code) => {
    if (step === "current") {
      setCurrentPin(code);
      setStep("new");
      setError("");
      setKey((k) => k + 1);
      return;
    }

    if (step === "new") {
      setFirstPin(code);
      setStep("confirm");
      setError("");
      setKey((k) => k + 1);
      return;
    }

    if (code !== firstPin) {
      setError("PINs do not match. Start over.");
      setFirstPin(null);
      setStep("new");
      setKey((k) => k + 1);
      return;
    }

    setSaving(true);
    try {
      await setAdminPin({ pin: code, ...(currentPin ? { currentPin } : {}) });
      toast(hasPin ? "Admin PIN updated successfully" : "Admin PIN set successfully", "success");
      navigate("/admin");
    } catch (err) {
      toast(err.response?.data?.message || "Failed to set Admin PIN", "error");
      setFirstPin(null);
      setCurrentPin(null);
      setStep(hasPin ? "current" : "new");
      setKey((k) => k + 1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/admin" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">
          {hasPin ? "Change Admin PIN" : "Set Admin PIN"}
        </h1>
      </div>

      <Card>
        {step !== "loading" && step !== "error" && (
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-info-light p-3 dark:bg-info/10">
          <ShieldCheck size={20} className="shrink-0 text-info" />
          <p className="text-xs text-text-secondary dark:text-gray-300">
            This PIN is separate from your transaction PIN. It's required before any high-risk
            admin action - company withdrawals, wallet adjustments, pricing changes, and more.
          </p>
          </div>
        )}
        {step === "loading" ? (
          <p className="text-center text-sm text-text-secondary dark:text-gray-400">Checking Admin PIN status...</p>
        ) : step === "error" ? (
          <p role="alert" className="text-center text-sm text-red-600">{error}</p>
        ) : (
          <>
            <p className="mb-6 text-center text-sm text-text-secondary dark:text-gray-400">
              {step === "current"
                ? "Enter your current 4-digit Admin PIN"
                : step === "confirm"
                  ? "Confirm your new 4-digit Admin PIN"
                  : "Create a 4-digit Admin PIN"}
            </p>
            <CodeInput key={key} length={4} secure onComplete={handleComplete} error={error} />
            {saving && <p className="mt-4 text-center text-sm text-text-secondary">Saving...</p>}
          </>
        )}
      </Card>
    </div>
  );
}
