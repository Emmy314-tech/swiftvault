import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, RefreshCw } from "lucide-react";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import Input from "../../components/ui/Input.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { SkeletonList } from "../../components/ui/Skeleton.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getPendingReconciliation, getReconciliationAttempts, reconcileTransaction } from "../../services/adminService.js";

const PAGE_SIZE = 20;

function formatAge(createdAt) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export default function AdminReconciliation() {
  const toast = useToast();
  const [result, setResult] = useState({ transactions: [], totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [manualTransaction, setManualTransaction] = useState(null);
  const [evidenceReference, setEvidenceReference] = useState("");
  const [reason, setReason] = useState("");
  const [providerCost, setProviderCost] = useState("");
  const [providerFee, setProviderFee] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [attemptsFor, setAttemptsFor] = useState(null);
  const [attempts, setAttempts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getPendingReconciliation({ page, limit: PAGE_SIZE });
      setResult(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const submitManual = async (status) => {
    if (!manualTransaction || !evidenceReference.trim() || !reason.trim() || !adminPin) return;
    if (status === "success" && (providerCost === "" || providerFee === "")) {
      toast("Enter both actual provider charges confirmed with the provider before confirming success.", "error");
      return;
    }
    setWorkingId(manualTransaction._id);
    try {
      const payload = { status, evidenceReference, reason, adminPin };
      if (status === "success") {
        payload.providerCost = Number(providerCost);
        payload.providerFee = Number(providerFee);
      }
      const { data } = await reconcileTransaction(manualTransaction._id, payload);
      toast(`Manual reconciliation recorded: ${data.status}`, "success");
      setManualTransaction(null);
      setEvidenceReference("");
      setReason("");
      setProviderCost("");
      setProviderFee("");
      setAdminPin("");
      await load();
    } catch (requestError) {
      toast(requestError.response?.data?.message || "Reconciliation was not completed", "error");
    } finally {
      setWorkingId(null);
    }
  };

  const showAttempts = async (transaction) => {
    try {
      const { data } = await getReconciliationAttempts(transaction._id);
      setAttempts(data.attempts || []);
      setAttemptsFor(transaction);
    } catch {
      toast("Could not load reconciliation history", "error");
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin/transactions" aria-label="Back to transactions"><ArrowLeft size={20} className="text-gray-500" /></Link>
          <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Transaction Reconciliation</h1>
        </div>
        <Button variant="outline" icon={RefreshCw} onClick={load} loading={loading} aria-label="Refresh reconciliation queue" />
      </div>

      {loading && <SkeletonList count={6} />}
      {error && <ErrorState message="Could not load pending transactions." onRetry={load} />}
      {!loading && !error && result.transactions.length === 0 && (
        <EmptyState icon={ClipboardCheck} title="No pending transactions" />
      )}

      {!loading && !error && result.transactions.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-borderc bg-white dark:border-gray-800 dark:bg-gray-900">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-borderc text-xs uppercase text-text-secondary dark:border-gray-800">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Age</th>
                  <th className="px-4 py-3">Recovery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderc dark:divide-gray-800">
                {result.transactions.map((transaction) => (
                  <tr key={transaction._id}>
                    <td className="px-4 py-3 font-mono text-xs">{transaction.reference}</td>
                    <td className="px-4 py-3 capitalize">{transaction.provider || "Unavailable"}</td>
                    <td className="px-4 py-3">₦{Number(transaction.amount).toLocaleString()}</td>
                    <td className="px-4 py-3"><Badge variant="warning">{transaction.status}</Badge></td>
                    <td className="px-4 py-3">{formatAge(transaction.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {transaction.provider === "peyflex" ? (
                          <Button size="sm" variant="outline" onClick={() => {
                            setProviderCost("");
                            setProviderFee("");
                            setManualTransaction(transaction);
                          }}>Manual review</Button>
                        ) : <span className="text-xs text-text-secondary">Provider unavailable</span>}
                        <button className="text-xs text-primary-700 underline" onClick={() => showAttempts(transaction)}>History</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={result.totalPages || 1} onPageChange={setPage} />
        </>
      )}

      <Modal open={!!manualTransaction} onClose={() => setManualTransaction(null)} title="Peyflex Manual Reconciliation">
        {manualTransaction && (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">Reference: <span className="font-mono">{manualTransaction.reference}</span></p>
            <p className="text-xs text-text-secondary">Verify this reference and amount in the Peyflex merchant portal or with provider support. Record a ticket/reference, not screenshots, credentials, or provider payloads.</p>
            {manualTransaction.pricingSnapshot && (
              <p className="text-xs text-text-secondary">
                Price snapshot: {manualTransaction.pricingSnapshot.appliedSchedule || "normal"} schedule;
                configured estimate: provider cost ₦{Number(manualTransaction.providerCost || 0).toLocaleString()} +
                fee ₦{Number(manualTransaction.providerFee || 0).toLocaleString()}. This estimate is not used as final accounting;
                enter the actual charges confirmed by Peyflex before success.
              </p>
            )}
            <Input label="Provider evidence reference" value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} required />
            <Input label="Reason / verification note" value={reason} onChange={(event) => setReason(event.target.value)} required />
            <Input label="Actual provider cost confirmed by Peyflex (required for success)" type="number" min={0} value={providerCost} onChange={(event) => setProviderCost(event.target.value)} />
            <Input label="Actual provider fee confirmed by Peyflex (enter 0 if none)" type="number" min={0} value={providerFee} onChange={(event) => setProviderFee(event.target.value)} />
            <Input label="Admin PIN" type="password" value={adminPin} onChange={(event) => setAdminPin(event.target.value)} required />
            <div className="flex justify-end gap-2">
              {!["epin", "exam_pin"].includes(manualTransaction.type) && (
                <Button onClick={() => submitManual("success")} loading={workingId === manualTransaction._id}>Confirm success</Button>
              )}
              <Button variant="outline" onClick={() => submitManual("failed")} loading={workingId === manualTransaction._id}>Confirm failure and refund</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!attemptsFor} onClose={() => setAttemptsFor(null)} title="Reconciliation History">
        <div className="max-h-96 space-y-3 overflow-y-auto">
          {attempts.length === 0 && <p className="text-sm text-text-secondary">No reconciliation attempts recorded.</p>}
          {attempts.map((attempt) => (
            <div key={attempt._id} className="border-b border-borderc pb-3 text-sm dark:border-gray-800">
              <div className="flex justify-between gap-3"><span>{attempt.provider} / {attempt.mode}</span><Badge variant={attempt.result === "resolved" ? "success" : attempt.result === "error" ? "error" : "warning"}>{attempt.result}</Badge></div>
              <p className="mt-1 text-xs text-text-secondary">{attempt.observedStatus || "No provider status"} · {new Date(attempt.createdAt).toLocaleString()}</p>
              {attempt.actor && <p className="text-xs text-text-secondary">Admin: {attempt.actor.fullName || attempt.actor.username}</p>}
              {attempt.reason && <p className="mt-1 break-words text-xs">{attempt.reason}</p>}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}