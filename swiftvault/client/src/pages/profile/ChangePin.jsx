import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import CodeInput from "../../components/ui/CodeInput.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { setPin } from "../../services/authService.js";
import { getProfile } from "../../services/userService.js";

export default function ChangePin() {
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
          const configured = Boolean(data.hasTransactionPin);
          setHasPin(configured);
          setStep(configured ? "current" : "new");
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.response?.data?.message || "Unable to check your PIN status.");
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
      await setPin({ pin: code, ...(currentPin ? { currentPin } : {}) });
      toast("Transaction PIN updated successfully", "success");
      navigate("/profile");
    } catch (err) {
      toast(err.response?.data?.message || "Failed to update PIN", "error");
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
        <Link to="/profile" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Change Transaction PIN</h1>
      </div>

      <Card>
        {step === "loading" ? (
          <p className="text-center text-sm text-text-secondary dark:text-gray-400">Checking PIN status...</p>
        ) : step === "error" ? (
          <p role="alert" className="text-center text-sm text-red-600">{error}</p>
        ) : (
          <>
            <p className="mb-6 text-center text-sm text-text-secondary dark:text-gray-400">
              {step === "current"
                ? "Enter your current 4-digit transaction PIN"
                : step === "confirm"
                  ? "Confirm your new 4-digit PIN"
                  : "Enter a new 4-digit transaction PIN"}
            </p>
            <CodeInput key={key} length={4} secure onComplete={handleComplete} error={error} />
            {saving && <p className="mt-4 text-center text-sm text-text-secondary">Saving...</p>}
          </>
        )}
      </Card>
    </div>
  );
}
