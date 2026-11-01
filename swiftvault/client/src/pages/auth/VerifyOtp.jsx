import { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, MailCheck } from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import CodeInput from "../../components/ui/CodeInput.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { verifyOTP, resendOtp } from "../../services/authService.js";

export default function VerifyOtp() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { login } = useAuth();
  const phone = location.state?.phone || "";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  // Simple cooldown so the resend button can't be hammered (server also rate-limits).
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  const handleComplete = async (otp) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await verifyOTP({ phone, otp });
      login(data.token, data.user);
      toast("Phone verified! Welcome to SwiftVault 🎉", "success");
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid or expired OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!phone || resendLoading || resendCountdown > 0) return;
    setResendLoading(true);
    try {
      const { data } = await resendOtp({ phone });
      toast(data.message || "A new code has been sent", "success");
      setResendCountdown(30);
      setError("");
    } catch (err) {
      toast(err.response?.data?.message || "Could not resend the code right now", "error");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white px-6 py-8 dark:bg-gray-950">
      <Link to="/login" aria-label="Back">
        <ArrowLeft size={22} className="text-gray-500" />
      </Link>

      <div className="mx-auto mt-10 w-full max-w-sm flex-1 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-900/30">
          <MailCheck size={28} className="text-primary-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Verify your phone</h1>
        <p className="mt-1 mb-8 text-sm text-gray-400">
          Enter the 6-digit code sent to <span className="font-medium">{phone || "your phone"}</span>
        </p>

        <CodeInput length={6} onComplete={handleComplete} error={error} />

        {loading && <p className="mt-4 text-sm text-gray-400">Verifying...</p>}

        <div className="mt-8">
          <Button
            variant="secondary"
            onClick={handleResend}
            disabled={!phone || resendLoading || resendCountdown > 0}
            loading={resendLoading}
          >
            {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : "Resend code"}
          </Button>
        </div>
      </div>
    </div>
  );
}
