import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone } from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { requestReset } from "../../services/authService.js";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await requestReset({ phone });
      toast(data.message || "Recovery code sent", "success");
      navigate("/reset-password", { state: { phone } });
    } catch (err) {
      toast(err.response?.data?.message || "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white px-6 py-8 dark:bg-gray-950">
      <Link to="/login" aria-label="Back">
        <ArrowLeft size={22} className="text-gray-500" />
      </Link>

      <div className="mx-auto mt-10 w-full max-w-sm flex-1">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Forgot password?</h1>
        <p className="mt-1 mb-8 text-sm text-gray-400">
          Enter your registered phone number and we'll send you a recovery code.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="Phone Number"
            icon={Phone}
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button type="submit" loading={loading}>Send Recovery Code</Button>
        </form>
      </div>
    </div>
  );
}
