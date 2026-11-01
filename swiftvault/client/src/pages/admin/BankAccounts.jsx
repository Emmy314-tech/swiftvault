import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Landmark } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Toggle from "../../components/ui/Toggle.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { SkeletonList } from "../../components/ui/Skeleton.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getBusinessSettings, createBankAccount, editBankAccount, deleteBankAccount } from "../../services/adminService.js";

export default function BankAccounts() {
  const toast = useToast();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ bankName: "", bankCode: "", accountName: "", accountNumber: "", accountType: "Current" });

  // Every mutation here now requires an Admin PIN - this holds whichever action
  // is pending confirmation, so one shared PinConfirmModal can serve all three.
  const [pendingAction, setPendingAction] = useState(null); // { type: "create" | "toggle" | "delete", payload }
  const [pinError, setPinError] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getBusinessSettings();
      setAccounts(data.settings.companyBankAccounts || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleConfirmPin = async (adminPin) => {
    setProcessing(true);
    setPinError("");
    try {
      if (pendingAction.type === "create") {
        await createBankAccount({ ...form, adminPin });
        toast("Bank account added", "success");
        setModalOpen(false);
        setForm({ bankName: "", bankCode: "", accountName: "", accountNumber: "", accountType: "Current" });
      } else if (pendingAction.type === "toggle") {
        const acc = pendingAction.payload;
        await editBankAccount(acc._id, { status: acc.status === "active" ? "inactive" : "active", adminPin });
        toast("Account status updated", "success");
      } else if (pendingAction.type === "delete") {
        await deleteBankAccount(pendingAction.payload, { adminPin });
        toast("Account removed", "success");
      }
      setPendingAction(null);
      load();
    } catch (err) {
      setPinError(err.response?.data?.message || "Action failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin/business-control" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
          <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Company Bank Accounts</h1>
        </div>
        <Button size="sm" fullWidth={false} icon={Plus} onClick={() => setModalOpen(true)}>Add</Button>
      </div>

      {loading && <SkeletonList count={3} />}
      {error && <ErrorState message="Could not load bank accounts." onRetry={load} />}

      {!loading && !error && accounts.length === 0 && (
        <EmptyState icon={Landmark} title="No bank accounts added yet" />
      )}

      {!loading && !error && accounts.map((acc) => (
        <Card key={acc._id}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-text-primary dark:text-gray-100">{acc.bankName}</p>
              <p className="text-sm text-text-secondary dark:text-gray-400">{acc.accountName}</p>
              <p className="font-mono text-sm text-text-primary dark:text-gray-200">{acc.accountNumber}</p>
            </div>
            <Badge variant={acc.status === "active" ? "success" : "neutral"}>{acc.status}</Badge>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-borderc pt-3 dark:border-gray-800">
            <Toggle checked={acc.status === "active"} onChange={() => setPendingAction({ type: "toggle", payload: acc })} label="Active" />
            <button onClick={() => setPendingAction({ type: "delete", payload: acc._id })} aria-label="Delete account" className="text-gray-400 hover:text-error">
              <Trash2 size={17} />
            </button>
          </div>
        </Card>
      ))}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Bank Account">
        <form onSubmit={(e) => { e.preventDefault(); setPendingAction({ type: "create" }); }} className="space-y-3">
          <Input label="Bank Name" required value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          <Input label="Bank Code" required placeholder="e.g. 058 for GTBank" value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })} />
          <Input label="Account Name" required value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
          <Input label="Account Number" required value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
          <Input label="Account Type" value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })} />
          <Button type="submit">Add Account</Button>
        </form>
      </Modal>

      <PinConfirmModal
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={handleConfirmPin}
        loading={processing}
        error={pinError}
        title="Confirm with Admin PIN"
        subtitle="This action requires your Admin PIN"
      />
    </div>
  );
}
