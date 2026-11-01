import { useEffect, useState } from "react";
import { Download, Users, Receipt, TrendingUp, BookOpen, AlertTriangle } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import {
  exportFinancialLedger,
  getFinancialLedgerReport,
  getFinancialLedgerStatus,
  listAllUsers,
  getAllTransactions,
  listFinancialLedgerBackfillIssues,
  recordOperatingExpense,
  recordProviderCommission,
  reverseOperatingExpense,
  settleProviderCommission,
} from "../../services/adminService.js";
import { TYPE_LABEL } from "../../utils/transactionLabels.js";
import { exportToCsv } from "../../utils/exportCsv.js";

const TIER_LABEL = { normal: "Normal", retail: "Retail", wholesale: "Wholesale" };

export default function Reports() {
  const toast = useToast();
  const [generating, setGenerating] = useState(null);
  const [ledgerStatus, setLedgerStatus] = useState(null);
  const [ledgerReport, setLedgerReport] = useState(null);
  const [ledgerIssues, setLedgerIssues] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState(false);
  const [ledgerFilters, setLedgerFilters] = useState({ from: "", to: "", category: "", status: "", reference: "" });
  const [ledgerPage, setLedgerPage] = useState(1);
  const [expense, setExpense] = useState({
    amount: "",
    category: "hosting",
    reference: "",
    description: "",
    evidenceReference: "",
    settlementStatus: "incurred",
    adminPin: "",
  });
  const [commission, setCommission] = useState({
    amount: "",
    reference: "",
    description: "",
    evidenceReference: "",
    settlementStatus: "success",
    adminPin: "",
  });
  const [commissionSettlement, setCommissionSettlement] = useState({
    commissionReference: "",
    settlementReference: "",
    evidenceReference: "",
    adminPin: "",
  });

  useEffect(() => {
    getFinancialLedgerStatus()
      .then(({ data }) => setLedgerStatus(data))
      .catch(() => setLedgerError(true))
      .finally(() => setLedgerLoading(false));
  }, []);

  useEffect(() => {
    if (!ledgerStatus?.ready) return;
    let active = true;
    setLedgerLoading(true);
    setLedgerError(false);
    getFinancialLedgerReport({ ...ledgerFilters, page: ledgerPage, limit: 25 })
      .then(({ data }) => { if (active) setLedgerReport(data); })
      .catch(() => { if (active) setLedgerError(true); })
      .finally(() => { if (active) setLedgerLoading(false); });
    return () => { active = false; };
  }, [ledgerStatus?.ready, ledgerFilters, ledgerPage]);

  useEffect(() => {
    if (ledgerStatus?.ready) return;
    listFinancialLedgerBackfillIssues({ status: "open", limit: 50 })
      .then(({ data }) => setLedgerIssues(data.issues || []))
      .catch(() => setLedgerIssues([]));
  }, [ledgerStatus?.ready]);

  const generateUserReport = async () => {
    setGenerating("user");
    try {
      const { data } = await listAllUsers();
      exportToCsv(`SwiftVault-User-Report-${new Date().toISOString().slice(0, 10)}.csv`, data, [
        { header: "Full Name", key: "fullName" },
        { header: "Username", key: "username" },
        { header: "Phone", key: "phone" },
        { header: "Email", key: "email" },
        { header: "Tier", key: "tier", csvValue: (r) => TIER_LABEL[r.tier] || r.tier || "Normal" },
        { header: "Upgrade Status", key: "isUpgraded", csvValue: (r) => r.isUpgraded ? "Upgraded User" : "Normal User" },
        { header: "Wallet Balance", key: "walletBalance" },
        { header: "Status", key: "isSuspended", csvValue: (r) => (r.isSuspended ? "Suspended" : "Active") },
        { header: "Joined", key: "createdAt", csvValue: (r) => new Date(r.createdAt).toLocaleDateString() },
      ]);
      toast("User report downloaded", "success");
    } catch {
      toast("Failed to generate report", "error");
    } finally {
      setGenerating(null);
    }
  };

  const generateTransactionReport = async () => {
    setGenerating("transaction");
    try {
      const { data } = await getAllTransactions({ limit: 500 });
      exportToCsv(`SwiftVault-Transaction-Report-${new Date().toISOString().slice(0, 10)}.csv`, data.transactions, [
        { header: "Date", key: "createdAt", csvValue: (r) => new Date(r.createdAt).toLocaleString() },
        { header: "Type", key: "type", csvValue: (r) => TYPE_LABEL[r.type] || r.type },
        { header: "Description", key: "description" },
        { header: "Amount", key: "amount" },
        { header: "Status", key: "status" },
        { header: "Reference", key: "reference" },
      ]);
      toast("Transaction report downloaded", "success");
    } catch {
      toast("Failed to generate report", "error");
    } finally {
      setGenerating(null);
    }
  };

  const generateRevenueReport = async () => {
    setGenerating("revenue");
    try {
      const { data } = await exportFinancialLedger({ ...ledgerFilters, accountClass: "revenue" });
      const url = URL.createObjectURL(data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `SwiftVault-Revenue-Ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast("Posted revenue ledger downloaded", "success");
    } catch {
      toast("Failed to generate report", "error");
    } finally {
      setGenerating(null);
    }
  };

  const updateLedgerFilter = (field, value) => {
    setLedgerFilters((current) => ({ ...current, [field]: value }));
    setLedgerPage(1);
  };

  const downloadLedger = async () => {
    setGenerating("ledger");
    try {
      const { data } = await exportFinancialLedger(ledgerFilters);
      const url = URL.createObjectURL(data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `SwiftVault-Financial-Ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast("Financial ledger exported", "success");
    } catch {
      toast("Financial ledger export is unavailable", "error");
    } finally {
      setGenerating(null);
    }
  };

  const submitExpense = async (event) => {
    event.preventDefault();
    setGenerating("expense");
    try {
      await recordOperatingExpense(expense);
      toast("Expense recorded in the financial ledger", "success");
      setExpense((current) => ({
        ...current,
        amount: "",
        reference: "",
        description: "",
        evidenceReference: "",
        adminPin: "",
      }));
      const { data } = await getFinancialLedgerReport({ ...ledgerFilters, page: ledgerPage, limit: 25 });
      setLedgerReport(data);
    } catch (error) {
      toast(error.response?.data?.message || "Expense could not be recorded", "error");
    } finally {
      setGenerating(null);
    }
  };

  const submitCommission = async (event) => {
    event.preventDefault();
    setGenerating("commission");
    try {
      await recordProviderCommission(commission);
      toast("Provider commission recorded in the financial ledger", "success");
      setCommission((current) => ({
        ...current,
        amount: "",
        reference: "",
        description: "",
        evidenceReference: "",
        adminPin: "",
      }));
      const { data } = await getFinancialLedgerReport({ ...ledgerFilters, page: ledgerPage, limit: 25 });
      setLedgerReport(data);
    } catch (error) {
      toast(error.response?.data?.message || "Provider commission could not be recorded", "error");
    } finally {
      setGenerating(null);
    }
  };

  const submitCommissionSettlement = async (event) => {
    event.preventDefault();
    setGenerating("commission-settlement");
    try {
      await settleProviderCommission(commissionSettlement);
      toast("Provider commission settlement recorded", "success");
      setCommissionSettlement({
        commissionReference: "",
        settlementReference: "",
        evidenceReference: "",
        adminPin: "",
      });
      const { data } = await getFinancialLedgerReport({ ...ledgerFilters, page: ledgerPage, limit: 25 });
      setLedgerReport(data);
    } catch (error) {
      toast(error.response?.data?.message || "Provider commission settlement could not be recorded", "error");
    } finally {
      setGenerating(null);
    }
  };

  const reverseExpense = async (entry) => {
    const reason = window.prompt(`Reason for reversing expense ${entry.sourceReference || ""}:`);
    if (!reason?.trim()) return;
    const adminPin = window.prompt("Enter Admin PIN to authorize the reversal:");
    if (!adminPin) return;
    setGenerating(`reverse-${entry._id}`);
    try {
      await reverseOperatingExpense(entry.sourceReference, { reason: reason.trim(), adminPin });
      toast("Expense reversal recorded", "success");
      const { data } = await getFinancialLedgerReport({ ...ledgerFilters, page: ledgerPage, limit: 25 });
      setLedgerReport(data);
    } catch (error) {
      toast(error.response?.data?.message || "Expense reversal could not be recorded", "error");
    } finally {
      setGenerating(null);
    }
  };

  const setExpenseField = (field, value) => setExpense((current) => ({ ...current, [field]: value }));
  const setCommissionField = (field, value) => setCommission((current) => ({ ...current, [field]: value }));
  const setCommissionSettlementField = (field, value) =>
    setCommissionSettlement((current) => ({ ...current, [field]: value }));

  const REPORTS = [
    { label: "Revenue Report", description: "Posted revenue-account entries from the reconciled financial ledger", icon: TrendingUp, action: generateRevenueReport, key: "revenue" },
    { label: "User Report", description: "All users with tier, upgrade status, balance, and account status", icon: Users, action: generateUserReport, key: "user" },
    { label: "Transaction Report", description: "All transactions (last 500)", icon: Receipt, action: generateTransactionReport, key: "transaction" },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Reports</h1>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-primary-600" />
            <h2 className="font-semibold text-text-primary dark:text-gray-100">Financial Ledger</h2>
          </div>
          <Button size="sm" fullWidth={false} icon={Download} loading={generating === "ledger"} disabled={!ledgerStatus?.ready} onClick={downloadLedger}>
            Export filtered ledger
          </Button>
        </div>

        {ledgerLoading && !ledgerStatus && <p className="text-sm text-text-secondary">Checking ledger readiness…</p>}
        {ledgerError && <p className="text-sm text-error">Financial ledger data could not be loaded. Retry by refreshing this page.</p>}
        {ledgerStatus && !ledgerStatus.ready && (
          <div className="space-y-3 rounded-xl border border-warning/30 bg-warning-light p-4 dark:bg-warning/10">
            <div className="flex gap-2 text-sm font-medium text-text-primary dark:text-gray-100">
              <AlertTriangle size={18} className="shrink-0 text-warning" />
              <span>Financial totals and exports are withheld until the evidence-based legacy backfill has no unresolved records.</span>
            </div>
            <p className="text-xs text-text-secondary">
              Status: {ledgerStatus.reportingStatus}; unresolved sources: {ledgerStatus.unresolvedSourceCount ?? "not yet scanned"}.
              Use the guarded server backfill only after reviewing its dry-run output and recording an approval reference.
            </p>
            {ledgerIssues.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead><tr><th className="p-2">Source</th><th className="p-2">Reference</th><th className="p-2">Reason</th><th className="p-2">Details</th></tr></thead>
                  <tbody>
                    {ledgerIssues.map((issue) => (
                      <tr key={issue._id} className="border-t border-borderc dark:border-gray-700">
                        <td className="p-2">{issue.sourceType}</td>
                        <td className="p-2">{issue.reference || issue.sourceId}</td>
                        <td className="p-2">{issue.reasonCode}</td>
                        <td className="p-2">{issue.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {ledgerStatus?.ready && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <LedgerMetric label="Total income" value={ledgerReport?.summary.totalIncome} />
              <LedgerMetric label="Total expenses" value={ledgerReport?.summary.totalExpenses} />
              <LedgerMetric label="Net operating result" value={ledgerReport?.summary.netOperatingResult} />
              <LedgerMetric label="Customer wallet liabilities" value={ledgerReport?.summary.customerWalletLiabilities} />
              <LedgerMetric label="Membership revenue" value={ledgerReport?.summary.membershipRevenue} />
              <LedgerMetric label="VTU service revenue" value={ledgerReport?.summary.serviceRevenue} />
              <LedgerMetric label="Provider commission income" value={ledgerReport?.summary.providerCommissionIncome} />
              <LedgerMetric label="Unsettled provider commissions" value={ledgerReport?.summary.providerCommissionReceivable} />
              <LedgerMetric label="VTU provider costs" value={ledgerReport?.summary.providerCosts} />
              <LedgerMetric label="VTU margin" value={ledgerReport?.summary.vtuMargin} />
              <LedgerMetric label="Referral bonus expenses" value={ledgerReport?.summary.referralBonusExpenses} />
              <LedgerMetric label="Payment processor fees" value={ledgerReport?.summary.paymentProcessorFees} />
              <LedgerMetric label="Refunds and chargebacks" value={ledgerReport?.summary.refundsAndChargebacks} />
              <LedgerMetric label="Quarantined deposits (liability)" value={ledgerReport?.summary.quarantinedDeposits?.amount} />
            </div>
            <div className="rounded-lg bg-info-light p-3 text-xs text-text-secondary dark:bg-info/10">
              External provider/bank statement reconciliation: {ledgerReport?.summary.externalStatementReconciliation}.
              Wallet subledger differences: {ledgerReport?.summary.walletReconciliation?.userCount || 0} users; absolute difference ₦{Number(ledgerReport?.summary.walletReconciliation?.absoluteDifference || 0).toLocaleString()}.
              Amounts in customer-fund clearing accounts are not business revenue.
            </div>

            <form onSubmit={submitExpense} className="grid gap-3 rounded-xl border border-borderc p-4 dark:border-gray-700 md:grid-cols-3">
              <h3 className="font-semibold text-text-primary dark:text-gray-100 md:col-span-3">Record approved overhead or charge</h3>
              <label className="text-xs text-text-secondary">Amount (NGN)
                <input required min="0.01" step="0.01" type="number" value={expense.amount} onChange={(e) => setExpenseField("amount", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="text-xs text-text-secondary">Category
                <select value={expense.category} onChange={(e) => setExpenseField("category", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                  <option value="provider_cost">Provider cost</option>
                  <option value="provider_fee">Provider fee</option>
                  <option value="payment_processor_fee">Payment processor fee</option>
                  <option value="hosting">Hosting</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="operating_expense">Other operating expense</option>
                  <option value="refund">Refund</option>
                  <option value="chargeback">Chargeback</option>
                  <option value="other_expense">Other expense</option>
                </select>
              </label>
              <label className="text-xs text-text-secondary">Settlement
                <select value={expense.settlementStatus} onChange={(e) => setExpenseField("settlementStatus", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                  <option value="incurred">Incurred, unpaid</option>
                  <option value="paid">Paid (evidence required)</option>
                </select>
              </label>
              <label className="text-xs text-text-secondary">Unique invoice/transaction reference
                <input required maxLength={120} value={expense.reference} onChange={(e) => setExpenseField("reference", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="text-xs text-text-secondary">Evidence reference
                <input required maxLength={200} value={expense.evidenceReference} onChange={(e) => setExpenseField("evidenceReference", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="text-xs text-text-secondary">Admin PIN
                <input required inputMode="numeric" type="password" value={expense.adminPin} onChange={(e) => setExpenseField("adminPin", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="text-xs text-text-secondary md:col-span-2">Description
                <input required maxLength={500} value={expense.description} onChange={(e) => setExpenseField("description", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <div className="flex items-end"><Button type="submit" loading={generating === "expense"}>Record expense</Button></div>
            </form>

            <form onSubmit={submitCommission} className="grid gap-3 rounded-xl border border-borderc p-4 dark:border-gray-700 md:grid-cols-3">
              <h3 className="font-semibold text-text-primary dark:text-gray-100 md:col-span-3">Record confirmed provider commission</h3>
              <label className="text-xs text-text-secondary">Earned amount (NGN)
                <input required min="0.01" step="0.01" type="number" value={commission.amount} onChange={(e) => setCommissionField("amount", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="text-xs text-text-secondary">Settlement
                <select value={commission.settlementStatus} onChange={(e) => setCommissionField("settlementStatus", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                  <option value="success">Earned, unpaid (provider receivable)</option>
                  <option value="paid">Paid/settled to company bank</option>
                </select>
              </label>
              <label className="text-xs text-text-secondary">Unique provider reference
                <input required maxLength={120} value={commission.reference} onChange={(e) => setCommissionField("reference", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="text-xs text-text-secondary">Evidence reference
                <input required maxLength={200} value={commission.evidenceReference} onChange={(e) => setCommissionField("evidenceReference", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="text-xs text-text-secondary">Admin PIN
                <input required inputMode="numeric" type="password" value={commission.adminPin} onChange={(e) => setCommissionField("adminPin", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="text-xs text-text-secondary md:col-span-2">Description
                <input required maxLength={500} value={commission.description} onChange={(e) => setCommissionField("description", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <div className="flex items-end"><Button type="submit" loading={generating === "commission"}>Record commission</Button></div>
            </form>

            <form onSubmit={submitCommissionSettlement} className="grid gap-3 rounded-xl border border-borderc p-4 dark:border-gray-700 md:grid-cols-3">
              <h3 className="font-semibold text-text-primary dark:text-gray-100 md:col-span-3">Record commission settlement</h3>
              <label className="text-xs text-text-secondary">Original commission reference
                <input required maxLength={120} value={commissionSettlement.commissionReference} onChange={(e) => setCommissionSettlementField("commissionReference", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="text-xs text-text-secondary">Unique settlement reference
                <input required maxLength={120} value={commissionSettlement.settlementReference} onChange={(e) => setCommissionSettlementField("settlementReference", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="text-xs text-text-secondary">Settlement evidence reference
                <input required maxLength={200} value={commissionSettlement.evidenceReference} onChange={(e) => setCommissionSettlementField("evidenceReference", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="text-xs text-text-secondary">Admin PIN
                <input required inputMode="numeric" type="password" value={commissionSettlement.adminPin} onChange={(e) => setCommissionSettlementField("adminPin", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <p className="self-end text-xs text-text-secondary">Posts the full evidenced receivable to company bank; it does not recognize revenue a second time.</p>
              <div className="flex items-end"><Button type="submit" loading={generating === "commission-settlement"}>Record settlement</Button></div>
            </form>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-xs text-text-secondary">From<input type="date" value={ledgerFilters.from} onChange={(e) => updateLedgerFilter("from", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-2 py-2 dark:border-gray-700 dark:bg-gray-900" /></label>
              <label className="text-xs text-text-secondary">To<input type="date" value={ledgerFilters.to} onChange={(e) => updateLedgerFilter("to", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-2 py-2 dark:border-gray-700 dark:bg-gray-900" /></label>
              <label className="text-xs text-text-secondary">Category<input value={ledgerFilters.category} onChange={(e) => updateLedgerFilter("category", e.target.value)} placeholder="e.g. service_revenue" className="mt-1 w-full rounded-lg border border-borderc bg-white px-2 py-2 dark:border-gray-700 dark:bg-gray-900" /></label>
              <label className="text-xs text-text-secondary">Status<input value={ledgerFilters.status} onChange={(e) => updateLedgerFilter("status", e.target.value)} placeholder="success, pending, paid…" className="mt-1 w-full rounded-lg border border-borderc bg-white px-2 py-2 dark:border-gray-700 dark:bg-gray-900" /></label>
              <label className="text-xs text-text-secondary">Reference<input value={ledgerFilters.reference} onChange={(e) => updateLedgerFilter("reference", e.target.value)} className="mt-1 w-full rounded-lg border border-borderc bg-white px-2 py-2 dark:border-gray-700 dark:bg-gray-900" /></label>
            </div>

            {ledgerReport?.entries?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead><tr><th className="p-2">Date</th><th className="p-2">Category / Status</th><th className="p-2">Reference</th><th className="p-2">Description / postings</th><th className="p-2">Action</th></tr></thead>
                  <tbody>
                    {ledgerReport.entries.map((entry) => (
                      <tr key={entry._id} className="border-t border-borderc align-top dark:border-gray-700">
                        <td className="whitespace-nowrap p-2">{new Date(entry.occurredAt).toLocaleString()}</td>
                        <td className="p-2">{entry.category}<br />{entry.sourceStatus}</td>
                        <td className="p-2">{entry.sourceReference || entry.sourceId}</td>
                        <td className="p-2">
                          {entry.description}
                          {entry.lines.map((line, index) => (
                            <div key={`${entry._id}-${index}`} className="mt-1 font-mono text-[10px]">
                              {line.account}: Dr ₦{Number(line.debit).toLocaleString()} / Cr ₦{Number(line.credit).toLocaleString()}
                            </div>
                          ))}
                        </td>
                        <td className="p-2">
                          {entry.sourceType === "admin_expense" && (
                            <Button size="sm" fullWidth={false} loading={generating === `reverse-${entry._id}`} onClick={() => reverseExpense(entry)}>Reverse</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span>{ledgerReport.total} entries; page {ledgerReport.page} of {Math.max(ledgerReport.totalPages, 1)}</span>
                  <div className="flex gap-2">
                    <Button size="sm" fullWidth={false} disabled={ledgerPage <= 1} onClick={() => setLedgerPage((page) => Math.max(1, page - 1))}>Previous</Button>
                    <Button size="sm" fullWidth={false} disabled={ledgerPage >= ledgerReport.totalPages} onClick={() => setLedgerPage((page) => page + 1)}>Next</Button>
                  </div>
                </div>
              </div>
            )}
            {!ledgerLoading && !ledgerError && !ledgerReport?.entries?.length && <p className="py-3 text-center text-sm text-text-secondary">No ledger entries match these filters.</p>}
          </>
        )}
      </Card>

      <div className="space-y-3">
        {REPORTS.map(({ label, description, icon: Icon, action, key }) => (
          <Card key={key} className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
              <Icon size={20} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-text-primary dark:text-gray-100">{label}</p>
              <p className="text-xs text-text-secondary dark:text-gray-400">{description}</p>
            </div>
            <Button size="sm" fullWidth={false} icon={Download} loading={generating === key} onClick={action}>
              Export
            </Button>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-text-secondary dark:text-gray-500">
        Reports are capped at the 500 most recent matching records to keep exports fast.
      </p>
    </div>
  );
}

function LedgerMetric({ label, value }) {
  return (
    <div className="rounded-xl bg-background-secondary p-3 dark:bg-gray-800">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text-primary dark:text-gray-100">₦{Number(value || 0).toLocaleString()}</p>
    </div>
  );
}
