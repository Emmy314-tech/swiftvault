import { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import CodeInput from "../../components/ui/CodeInput.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { resetPassword } from "../../services/authService.js";

export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const phone = location.state?.phone || "";

  const [otp, setOtp] = useState("");
  const [passwords, setPasswords] = useState({ newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [otpError, setOtpError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      setOtpError("Enter the 6-digit code");
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast("Passwords do not match", "error");
      return;
    }
    setLoading(true);
    try {
      await resetPassword({ phone, otp, newPassword: passwords.newPassword });
      toast("Password reset successfully. Please log in.", "success");
      navigate("/login");
    } catch (err) {
      toast(err.response?.data?.message || "Reset failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white px-6 py-8 dark:bg-gray-950">
      <Link to="/forgot-password" aria-label="Back">
        <ArrowLeft size={22} className="text-gray-500" />
      </Link>

      <div className="mx-auto mt-6 w-full max-w-sm flex-1">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Reset password</h1>
        <p className="mt-1 mb-6 text-sm text-gray-400">
          Enter the code sent to {phone || "your phone"} and choose a new password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <CodeInput length={6} onComplete={setOtp} error={otpError} />

          <Input
            type="password"
            placeholder="New Password"
            icon={Lock}
            required
            value={passwords.newPassword}
            onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
          />
          <Input
            type="password"
            placeholder="Confirm New Password"
            icon={Lock}
            required
            value={passwords.confirmPassword}
            onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
          />

          <Button type="submit" loading={loading}>Reset Password</Button>
        </form>
      </div>
    </div>
  );
}
