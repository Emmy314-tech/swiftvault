import { useCallback, useEffect, useState } from "react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import {
  fundPromotionalReserve,
  getPromotionalReserve,
  updateWelcomeBonusStatus,
} from "../../services/adminService.js";

const money = (value) => new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
}).format(Number(value || 0));

export default function PromotionalReserve() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [funding, setFunding] = useState({
    amount: "",
    reference: "",
    evidenceReference: "",
    adminPin: "",
  });
  const [adminPin, setAdminPin] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data: reserve } = await getPromotionalReserve();
      setData(reserve);
    } catch (error) {
      setLoadError(true);
      toast(error.response?.data?.message || "Could not load promotional reserve.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleFunding = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await fundPromotionalReserve({ ...funding, amount: Number(funding.amount) });
      setFunding({ amount: "", reference: "", evidenceReference: "", adminPin: "" });
      toast("Promotional reserve allocation recorded.", "success");
      await load();
    } catch (error) {
      toast(error.response?.data?.message || "Reserve funding was not recorded.", "error");
    } finally {
      setFunding((current) => ({ ...current, adminPin: "" }));
      setSaving(false);
    }
  };

  const handleBonusStatus = async (enabled) => {
    setSaving(true);
    try {
      await updateWelcomeBonusStatus({ enabled, adminPin });
      setAdminPin("");
      toast(`Welcome bonus ${enabled ? "enabled" : "disabled"}.`, "success");
      await load();
    } catch (error) {
      toast(error.response?.data?.message || "Welcome bonus setting was not changed.", "error");
    } finally {
      setAdminPin("");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Promotional Reserve</h1>
        <p className="mt-1 text-sm text-text-secondary dark:text-gray-400">
          Allocate existing company-bank ledger funds and manage the one-time welcome bonus.
        </p>
      </div>

      {loading && <p className="text-sm text-text-secondary">Loading reserve status…</p>}
      {!loading && loadError && (
        <Card>
          <p className="mb-3 text-sm text-error">Promotional reserve status is unavailable.</p>
          <Button fullWidth={false} onClick={load}>Retry</Button>
        </Card>
      )}
      {!loading && data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Reserve available", money(data.balances?.availableBalance)],
              ["Total funded", money(data.balances?.fundedBalance)],
              ["Awards issued", money(data.balances?.awardedTotal)],
              ["Company-bank ledger", money(data.companyBankBalance)],
            ].map(([label, value]) => (
              <Card key={label}>
                <p className="text-xs text-text-secondary dark:text-gray-400">{label}</p>
                <p className="mt-1 text-lg font-bold text-text-primary dark:text-gray-100">{value}</p>
              </Card>
            ))}
          </div>

          <Card>
            <h2 className="font-semibold text-text-primary dark:text-gray-100">Reconciliation</h2>
            <p className="mt-2 text-sm">
              Internal ledger: <strong>{data.balances?.reconciled ? "Reconciled" : "Mismatch — bonus activation blocked"}</strong>
            </p>
            <p className="mt-1 text-sm text-text-secondary dark:text-gray-400">
              External bank statement reconciliation: {data.externalStatementReconciliation}.
            </p>
            <p className="mt-1 text-sm text-text-secondary dark:text-gray-400">
              Bonus liability: ledger {money(data.balances?.bonusLiability)} · user balances {money(data.balances?.userBonusBalance)}.
            </p>
            <p className="mt-1 text-sm text-text-secondary dark:text-gray-400">
              Bonus status: {data.enabled ? "Enabled" : "Disabled"} · configured award {money(data.bonusAmount)} · {data.balances?.awardCount || 0} awards.
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Allocate reserve funds</h2>
            <p className="mb-4 text-sm text-text-secondary dark:text-gray-400">
              This debits the company-bank ledger and records an append-only reserve journal. Use the actual statement evidence reference.
            </p>
            <form onSubmit={handleFunding} className="grid gap-3 sm:grid-cols-2">
              <Input label="Amount (NGN)" type="number" min="0.01" step="0.01" required value={funding.amount} onChange={(event) => setFunding({ ...funding, amount: event.target.value })} />
              <Input label="Unique allocation reference" maxLength={120} required value={funding.reference} onChange={(event) => setFunding({ ...funding, reference: event.target.value })} />
              <Input label="Bank-statement evidence reference" maxLength={200} required value={funding.evidenceReference} onChange={(event) => setFunding({ ...funding, evidenceReference: event.target.value })} />
              <Input label="Admin PIN" type="password" inputMode="numeric" required value={funding.adminPin} onChange={(event) => setFunding({ ...funding, adminPin: event.target.value })} />
              <div className="sm:col-span-2">
                <Button type="submit" loading={saving}>Allocate funds</Button>
              </div>
            </form>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Welcome bonus control</h2>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Input label="Admin PIN" type="password" inputMode="numeric" value={adminPin} onChange={(event) => setAdminPin(event.target.value)} />
              <div className="flex gap-2">
                <Button fullWidth={false} disabled={saving || !adminPin} onClick={() => handleBonusStatus(true)}>Enable</Button>
                <Button fullWidth={false} variant="secondary" disabled={saving || !adminPin} onClick={() => handleBonusStatus(false)}>Disable</Button>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Recent funding entries</h2>
            {data.fundingEntries?.length ? (
              <div className="space-y-3">
                {data.fundingEntries.map((entry) => (
                  <div key={entry.reference} className="flex flex-wrap justify-between gap-2 border-b border-borderc pb-2 text-sm last:border-0 dark:border-gray-800">
                    <span className="font-mono">{entry.reference}</span>
                    <span>{money(entry.amount)}</span>
                    <span className="text-text-secondary dark:text-gray-400">Evidence: {entry.evidenceReference}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-text-secondary dark:text-gray-400">No reserve funding entries.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
