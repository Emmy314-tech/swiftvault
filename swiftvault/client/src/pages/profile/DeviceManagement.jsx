import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import Button from "../../components/ui/Button.jsx";
import Card from "../../components/ui/Card.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { SkeletonList } from "../../components/ui/Skeleton.jsx";
import { getSecurityDevices, beginPasskeyRegistration, verifyPasskeyRegistration, revokePasskey, revokeSession } from "../../services/securityService.js";
import { getLoginHistory } from "../../services/loginHistoryService.js";

export default function DeviceManagement() {
  const navigate = useNavigate();
  const [security, setSecurity] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [securityResponse, historyResponse] = await Promise.all([getSecurityDevices(), getLoginHistory()]);
      setSecurity(securityResponse.data);
      setHistory(historyResponse.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addPasskey = async () => {
    const password = window.prompt("Confirm your SwiftVault password before adding a passkey.");
    if (!password) return;
    const deviceName = window.prompt("Name this passkey (for example, 'Personal phone').");
    if (!deviceName?.trim()) return;

    setWorking(true);
    setMessage("");
    try {
      const { data } = await beginPasskeyRegistration({ password, deviceName: deviceName.trim() });
      const response = await startRegistration({ optionsJSON: data.options });
      await verifyPasskeyRegistration(response);
      setMessage("Passkey added. This browser/device will still need transaction-specific authorization.");
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || err.message || "Passkey registration failed.");
    } finally {
      setWorking(false);
    }
  };

  const removePasskey = async (passkey) => {
    if (!window.confirm(`Revoke the passkey "${passkey.deviceName}"?`)) return;
    setWorking(true);
    try {
      await revokePasskey(passkey._id);
      setMessage("Passkey revoked.");
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || "Passkey could not be revoked.");
    } finally {
      setWorking(false);
    }
  };

  const removeSession = async (session) => {
    if (!window.confirm(`Sign out ${session.current ? "this device" : "this session"}?`)) return;
    setWorking(true);
    try {
      await revokeSession(session.tokenId);
      if (session.current) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
        return;
      }
      setMessage("Session revoked.");
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || "Session could not be revoked.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/profile" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Device &amp; passkey security</h1>
      </div>

      {message && <p role="status" className="rounded-xl bg-primary-50 p-3 text-sm text-primary-700 dark:bg-primary-900/20 dark:text-primary-300">{message}</p>}
      {security?.cooldownUntil && new Date(security.cooldownUntil) > new Date() && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          Outgoing transactions are restricted until {new Date(security.cooldownUntil).toLocaleString()} after account recovery or a new login context.
        </p>
      )}
      {loading && <SkeletonList count={5} />}
      {error && <ErrorState message="Could not load your security devices." onRetry={load} />}

      {!loading && !error && security && (
        <>
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-text-primary dark:text-gray-100"><KeyRound size={18} /> Passkeys</h2>
                <p className="mt-1 text-sm text-text-secondary dark:text-gray-400">
                  Passkeys use your device's supported screen lock or security key. SwiftVault never receives biometric data or private keys.
                </p>
              </div>
              {typeof window !== "undefined" && window.PublicKeyCredential && typeof navigator.credentials?.create === "function" && (
                <Button className="sm:w-auto" size="sm" loading={working} onClick={addPasskey}>Add passkey</Button>
              )}
            </div>
            {!(typeof window !== "undefined" && window.PublicKeyCredential && typeof navigator.credentials?.create === "function") && (
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                Passkey enrollment is not supported in this browser. You can continue using password sign-in and password confirmation for sensitive actions.
              </p>
            )}
            <div className="mt-4 space-y-2">
              {security.passkeys.length === 0 ? (
                <p className="text-sm text-text-secondary dark:text-gray-400">No passkeys are registered.</p>
              ) : security.passkeys.map((passkey) => (
                <div key={passkey._id} className="flex items-center justify-between gap-3 rounded-xl border border-borderc p-3 dark:border-gray-800">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{passkey.deviceName}</p>
                    <p className="text-xs text-text-secondary dark:text-gray-400">
                      Added {new Date(passkey.createdAt).toLocaleDateString()}
                      {passkey.lastUsedAt ? ` · Last used ${new Date(passkey.lastUsedAt).toLocaleString()}` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" fullWidth={false} disabled={working} onClick={() => removePasskey(passkey)}>Revoke</Button>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 font-semibold text-text-primary dark:text-gray-100"><Smartphone size={18} /> Active sessions</h2>
            <div className="mt-4 space-y-2">
              {security.sessions.length === 0 ? <p className="text-sm text-text-secondary">No active sessions.</p> : security.sessions.map((session) => (
                <div key={session.tokenId} className="flex items-center justify-between gap-3 rounded-xl border border-borderc p-3 dark:border-gray-800">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{session.current ? "This session" : session.userAgent || "Unknown device"}</p>
                    <p className="text-xs text-text-secondary dark:text-gray-400">{session.ipAddress} · Last active {new Date(session.lastUsedAt || session.createdAt).toLocaleString()}</p>
                  </div>
                  <Button variant="ghost" size="sm" fullWidth={false} disabled={working} onClick={() => removeSession(session)}>Sign out</Button>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 font-semibold text-text-primary dark:text-gray-100"><ShieldCheck size={18} /> Recent security events</h2>
            {security.events.length === 0 ? <p className="mt-3 text-sm text-text-secondary">No security events recorded.</p> : (
              <ul className="mt-3 divide-y divide-borderc dark:divide-gray-800">
                {security.events.map((event) => (
                  <li key={event._id} className="py-2 text-sm">
                    <p>{event.details || event.eventType.replaceAll("_", " ")}</p>
                    <p className="text-xs text-text-secondary">{event.ipAddress} · {new Date(event.createdAt).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padded={false}>
            <h2 className="px-4 pt-4 font-semibold text-text-primary dark:text-gray-100">Sign-in history</h2>
            {history.length === 0 ? <EmptyState icon={XCircle} title="No sign-in history yet" /> : (
              <div className="divide-y divide-borderc dark:divide-gray-800">
                {history.map((item) => (
                  <div key={item._id} className="flex items-start gap-3 px-4 py-3.5">
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.success ? "bg-success-light text-success dark:bg-success/10" : "bg-error-light text-error dark:bg-error/10"}`}>
                      {item.success ? <ShieldCheck size={15} /> : <XCircle size={15} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.device || item.userAgent || "Unknown device"}</p>
                      <p className="text-xs text-text-secondary">{item.ipAddress || "Unknown IP"} · {item.location || "Unknown location"}</p>
                      <p className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
