import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import CodeInput from "../../components/ui/CodeInput.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { requestReset, resetPassword } from "../../services/authService.js";

export default function ChangePassword() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [step, setStep] = useState(1); // 1 = request code, 2 = enter code + new password
  const [sending, setSending] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [passwords, setPasswords] = useState({ newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);

  const handleRequestCode = async () => {
    setSending(true);
    try {
      await requestReset({ phone: user.phone });
      toast("A verification code has been sent to your phone", "success");
      setStep(2);
    } catch (err) {
      toast(err.response?.data?.message || "Could not send code", "error");
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setOtpError("Enter the 6-digit code"); return; }
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast("Passwords do not match", "error");
      return;
    }
    setSaving(true);
    try {
      await resetPassword({ phone: user.phone, otp, newPassword: passwords.newPassword });
      toast("Password changed successfully", "success");
      navigate("/profile");
    } catch (err) {
      toast(err.response?.data?.message || "Failed to change password", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/profile" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Change Password</h1>
      </div>

      <Card>
        {step === 1 ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-text-secondary dark:text-gray-400">
              For your security, we'll send a verification code to your registered phone number
              before you can set a new password.
            </p>
            <Button loading={sending} onClick={handleRequestCode}>Send Verification Code</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <p className="mb-3 text-center text-sm text-text-secondary dark:text-gray-400">
                Enter the code sent to your phone
              </p>
              <CodeInput length={6} onComplete={setOtp} error={otpError} />
            </div>
            <Input
              label="New Password"
              type="password"
              icon={Lock}
              value={passwords.newPassword}
              onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
            />
            <Input
              label="Confirm New Password"
              type="password"
              icon={Lock}
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
            />
            <Button type="submit" loading={saving}>Change Password</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
