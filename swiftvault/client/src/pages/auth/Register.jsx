import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, User, Mail, Phone, Lock, Gift } from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import CodeInput from "../../components/ui/CodeInput.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { register as registerApi } from "../../services/authService.js";

const STEPS = ["Personal Info", "Password", "Create PIN", "Referral"];

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pinError, setPinError] = useState("");
  const [firstPin, setFirstPin] = useState(null);
  const [confirmingPin, setConfirmingPin] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    pin: "",
    referralCode: searchParams.get("ref")?.trim() || "",
  });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const nextFromPersonalInfo = () => {
    if (!form.fullName || !form.username || !form.email || !form.phone) {
      toast("Please fill in all fields", "error");
      return;
    }
    setStep(1);
  };

  const nextFromPassword = () => {
    if (form.password.length < 6) {
      toast("Password must be at least 6 characters", "error");
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast("Passwords do not match", "error");
      return;
    }
    setStep(2);
  };

  const handlePinComplete = (code) => {
    if (!confirmingPin) {
      setFirstPin(code);
      setConfirmingPin(true);
      setPinError("");
    } else {
      if (code !== firstPin) {
        setPinError("PINs do not match. Try again.");
        setFirstPin(null);
        setConfirmingPin(false);
        return;
      }
      setForm((f) => ({ ...f, pin: code }));
      setStep(3);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data } = await registerApi(form);
      toast(data.message || "Registration successful", "success");
      navigate("/verify-otp", { state: { phone: form.phone } });
    } catch (err) {
      toast(err.response?.data?.message || "Registration failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white px-6 py-8 dark:bg-gray-950">
      <div className="mb-6 flex items-center gap-3">
        {step > 0 ? (
          <button onClick={() => setStep((s) => s - 1)} aria-label="Back">
            <ArrowLeft size={22} className="text-gray-500" />
          </button>
        ) : (
          <Link to="/login" aria-label="Back to login">
            <ArrowLeft size={22} className="text-gray-500" />
          </Link>
        )}
        <div className="flex flex-1 gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary-600" : "bg-gray-200 dark:bg-gray-800"}`}
            />
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-sm flex-1">
        <h1 className="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">{STEPS[step]}</h1>
        <p className="mb-6 text-sm text-gray-400">Step {step + 1} of {STEPS.length}</p>

        {step === 0 && (
          <div className="space-y-4">
            <Input name="fullName" placeholder="Full Name" icon={User} value={form.fullName} onChange={handleChange} />
            <Input name="username" placeholder="Username" icon={User} value={form.username} onChange={handleChange} />
            <Input name="email" type="email" placeholder="Email" icon={Mail} value={form.email} onChange={handleChange} />
            <Input name="phone" placeholder="Phone Number" icon={Phone} value={form.phone} onChange={handleChange} />
            <Button onClick={nextFromPersonalInfo}>Continue</Button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Input name="password" type="password" placeholder="Password" icon={Lock} value={form.password} onChange={handleChange} />
            <Input name="confirmPassword" type="password" placeholder="Confirm Password" icon={Lock} value={form.confirmPassword} onChange={handleChange} />
            <Button onClick={nextFromPassword}>Continue</Button>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="mb-6 text-center text-sm text-gray-500">
              {confirmingPin ? "Confirm your 4-digit transaction PIN" : "Create a 4-digit transaction PIN"}
            </p>
            <CodeInput length={4} secure onComplete={handlePinComplete} error={pinError} key={confirmingPin ? "confirm" : "create"} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Input name="referralCode" placeholder="Referral code (optional)" icon={Gift} value={form.referralCode} onChange={handleChange} />
            <Button onClick={handleSubmit} loading={loading}>Create Account</Button>
          </div>
        )}
      </div>
    </div>
  );
}
