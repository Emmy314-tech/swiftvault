import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Wallet, User, Lock } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { login as loginApi } from "../../services/authService.js";
import { beginPasskeyLogin, verifyPasskeyLogin } from "../../services/securityService.js";

export default function Login() {
  const navigate = useNavigate();
  const toast = useToast();
  const { login } = useAuth();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await loginApi(form);
      login(data.token, data.user);
      toast("Welcome back!", "success");
      navigate(data.user.role === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || "Login failed";

      if (status === 403 && err.response?.data?.phoneVerified === false) {
        toast("Please verify your phone number to continue", "warning");
        navigate("/verify-otp", { state: { phone: form.identifier } });
        return;
      }
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    try {
      const { data: challenge } = await beginPasskeyLogin();
      const response = await startAuthentication({ optionsJSON: challenge.options });
      const { data } = await verifyPasskeyLogin(response);
      login(data.token, data.user);
      toast("Signed in securely with your passkey.", "success");
      navigate(data.user.role === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Passkey sign-in failed.", "error");
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-white px-6 py-10 dark:bg-gray-950">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600">
            <Wallet size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-400">Log in to continue to SwiftVault</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            name="identifier"
            placeholder="Phone, username, or email"
            icon={User}
            required
            value={form.identifier}
            onChange={handleChange}
          />
          <Input
            name="password"
            type="password"
            placeholder="Password"
            icon={Lock}
            required
            value={form.password}
            onChange={handleChange}
          />

          <div className="text-right">
            <Link to="/forgot-password" className="text-sm font-medium text-primary-600">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" loading={loading}>
            Log In
          </Button>
        </form>

        {typeof window !== "undefined" && window.PublicKeyCredential && typeof navigator.credentials?.get === "function" && (
          <div className="mt-4">
            <Button type="button" variant="secondary" loading={passkeyLoading} onClick={handlePasskeyLogin}>
              Sign in with a passkey
            </Button>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-gray-400">
          Don't have an account?{" "}
          <Link to="/register" className="font-semibold text-primary-600">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
