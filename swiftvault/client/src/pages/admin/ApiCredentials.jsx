import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Key, CheckCircle2, XCircle } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import Badge from "../../components/ui/Badge.jsx";
import { SkeletonList } from "../../components/ui/Skeleton.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getBusinessSettings, updateApiCredential } from "../../services/adminService.js";

const FIELDS = [
  { key: "paystackSecretKey", label: "Paystack Secret Key" },
  { key: "paystackPublicKey", label: "Paystack Public Key" },
  { key: "peyflexApiToken", label: "Peyflex API Token" },
  { key: "peyflexBaseUrl", label: "Peyflex Base URL" },
  { key: "termiiApiKey", label: "Termii API Key" },
];

export default function ApiCredentials() {
  const toast = useToast();
  const [status, setStatus] = useState({});
  const [dvaReadiness, setDvaReadiness] = useState(null);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingKey, setSavingKey] = useState(null);
  const [pendingKey, setPendingKey] = useState(null);
  const [pinError, setPinError] = useState("");

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getBusinessSettings();
      setStatus(data.credentials || {});
      setDvaReadiness(data.dvaReadiness || null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleConfirmPin = async (adminPin) => {
    const key = pendingKey;
    setSavingKey(key);
    setPinError("");
    try {
      const { data } = await updateApiCredential({ key, value: values[key], adminPin });
      setStatus(data.credentials);
      setValues((v) => ({ ...v, [key]: "" }));
      toast(`${key} updated`, "success");
      setPendingKey(null);
    } catch (err) {
      setPinError(err.response?.data?.message || "Failed to update credential");
    } finally {
      setSavingKey(null);
    }
  };

  const readinessBadge = (readinessStatus) => {
    if (readinessStatus === "ready") return { label: "Ready", variant: "success" };
    if (readinessStatus === "configured") return { label: "Configured", variant: "info" };
    if (readinessStatus === "unverified") return { label: "Unverified", variant: "warning" };
    if (readinessStatus === "informational") return { label: "Informational", variant: "neutral" };
    return { label: "Blocked", variant: "warning" };
  };

  if (loading) return <SkeletonList count={5} />;
  if (error) return <ErrorState message="Could not load credentials." onRetry={load} />;

  return (
    <div className="mx-auto max-w-lg space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/admin/business-control" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">API Credentials</h1>
      </div>

      <Card className="flex gap-3 bg-info-light dark:bg-info/10">
        <Key size={18} className="mt-0.5 shrink-0 text-info" />
        <p className="text-sm text-text-secondary dark:text-gray-300">
          Credentials are encrypted at rest and never displayed once saved - only whether
          they're configured. Leave a field blank to keep the current value.
        </p>
      </Card>

      {dvaReadiness && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-text-primary dark:text-gray-100">Paystack DVA readiness</h2>
              <p className="text-sm text-text-secondary dark:text-gray-400">Overall eligibility: {dvaReadiness.eligible ? "Ready" : "Blocked"}</p>
            </div>
            <Badge variant={dvaReadiness.eligible ? "success" : "warning"}>
              {dvaReadiness.eligible ? "Ready" : "Action required"}
            </Badge>
          </div>
          <div className="space-y-3">
            {dvaReadiness.checks.map((item) => (
              <div key={item.key} className="rounded-xl border border-borderc p-3 dark:border-gray-800">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-text-primary dark:text-gray-100">{item.label}</p>
                  <Badge variant={readinessBadge(item.status).variant}>
                    <span className="flex items-center gap-1">
                      {item.status === "ready" ? <CheckCircle2 size={11} /> : item.status === "blocked" ? <XCircle size={11} /> : null}
                      {readinessBadge(item.status).label}
                    </span>
                  </Badge>
                </div>
                {!!item.details?.length && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-text-secondary dark:text-gray-400">
                    {item.details.map((detail) => <li key={detail}>{detail}</li>)}
                  </ul>
                )}
                {item.action && (
                  <p className="mt-2 text-xs text-primary-700 dark:text-primary-300">Next: {item.action}</p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-secondary dark:text-gray-400">
            Readiness is configuration-only; this page does not approve KYC, change tier limits, probe Paystack, or enable live payments.
          </p>
        </Card>
      )}

      {FIELDS.map(({ key, label }) => (
        <Card key={key}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-text-primary dark:text-gray-100">{label}</p>
            <Badge variant={status[key]?.configured ? "success" : "neutral"}>
              {status[key]?.configured ? (
                <span className="flex items-center gap-1"><CheckCircle2 size={11} /> {status[key]?.source}</span>
              ) : (
                <span className="flex items-center gap-1"><XCircle size={11} /> Not set</span>
              )}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Enter new value"
              value={values[key] || ""}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
            <Button
              size="sm"
              fullWidth={false}
              loading={savingKey === key}
              disabled={!values[key]}
              onClick={() => setPendingKey(key)}
            >
              Save
            </Button>
          </div>
        </Card>
      ))}

      <PinConfirmModal
        open={!!pendingKey}
        onClose={() => setPendingKey(null)}
        onConfirm={handleConfirmPin}
        loading={!!savingKey}
        error={pinError}
        title="Confirm with Admin PIN"
        subtitle="Confirm this credential change with your Admin PIN"
      />
    </div>
  );
}
