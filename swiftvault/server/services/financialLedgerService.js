import crypto from "crypto";
import FinancialJournal from "../models/FinancialJournal.js";

export const FINANCIAL_ACCOUNTS = Object.freeze({
  providerClearing: "assets:provider_clearing",
  companyBank: "assets:company_bank",
  promotionalReserve: "assets:promotional_reserve",
  businessCash: "assets:business_cash",
  pendingCompanyWithdrawal: "assets:pending_company_withdrawal",
  customerWallet: "liabilities:customer_wallet",
  customerBonusWallet: "liabilities:customer_bonus_wallet",
  fundingSuspense: "liabilities:funding_suspense",
  pendingService: "liabilities:pending_service_sales",
  pendingTransfer: "liabilities:pending_bank_transfers",
  pendingTransferFee: "liabilities:unearned_transfer_fees",
  membershipRevenue: "revenue:membership",
  serviceRevenue: "revenue:customer_services",
  transferFeeRevenue: "revenue:transfer_fees",
  providerCommissionRevenue: "revenue:provider_commissions",
  referralExpense: "expenses:referral_bonus",
  welcomeBonusExpense: "expenses:welcome_bonus",
  providerCostExpense: "expenses:provider_cost",
  providerFeeExpense: "expenses:provider_fee",
  processorFeeExpense: "expenses:payment_processor_fee",
  operatingExpense: "expenses:operating",
  refundExpense: "expenses:refunds_and_chargebacks",
  expensePayable: "liabilities:operating_expenses_payable",
  providerPayable: "liabilities:provider_costs_payable",
  providerReceivable: "assets:provider_commissions_receivable",
  manualAdjustment: "equity:unclassified_manual_adjustments",
});

const cents = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Ledger amounts must be finite and non-negative.");
  const minor = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(minor) || Math.abs(minor / 100 - amount) > 0.000001) {
    throw new Error("Ledger amounts must have no more than two decimal places.");
  }
  return minor;
};

const normalizeLines = (lines) => {
  if (!Array.isArray(lines) || lines.length < 2) throw new Error("A financial journal requires at least two lines.");
  const normalized = lines.map((line) => {
    if (!line.account || typeof line.account !== "string") throw new Error("Every ledger line requires an account.");
    const debitCents = cents(line.debit || 0);
    const creditCents = cents(line.credit || 0);
    if ((debitCents > 0) === (creditCents > 0)) {
      throw new Error("Each ledger line must have exactly one positive debit or credit.");
    }
    return {
      account: line.account.trim(),
      debit: debitCents / 100,
      credit: creditCents / 100,
      userId: line.userId || null,
    };
  });
  const totalDebits = normalized.reduce((sum, line) => sum + cents(line.debit), 0);
  const totalCredits = normalized.reduce((sum, line) => sum + cents(line.credit), 0);
  if (totalDebits <= 0 || totalDebits !== totalCredits) {
    throw new Error("Financial journal debits and credits must balance to the cent.");
  }
  return normalized;
};

const fingerprintFor = (journal, lines) => crypto
  .createHash("sha256")
  .update(JSON.stringify({
    sourceType: journal.sourceType,
    serviceType: journal.serviceType || null,
    sourceId: String(journal.sourceId),
    sourceReference: journal.sourceReference || null,
    sourceTransactionId: journal.sourceTransactionId ? String(journal.sourceTransactionId) : null,
    category: journal.category,
    description: journal.description,
    sourceStatus: journal.sourceStatus,
    currency: journal.currency || "NGN",
    userId: journal.userId ? String(journal.userId) : null,
    counterpartyUserId: journal.counterpartyUserId ? String(journal.counterpartyUserId) : null,
    adminId: journal.adminId ? String(journal.adminId) : null,
    evidenceReference: journal.evidenceReference || null,
    reversalOf: journal.reversalOf ? String(journal.reversalOf) : null,
    settlesJournal: journal.settlesJournal ? String(journal.settlesJournal) : null,
    lines: lines.map(({ account, debit, credit, userId }) => ({
      account, debit, credit, userId: userId ? String(userId) : null,
    })),
  }))
  .digest("hex");

export const postFinancialJournal = async ({
  idempotencyKey,
  sourceType,
  serviceType = null,
  sourceId,
  sourceReference = null,
  sourceTransactionId = null,
  category,
  description,
  sourceStatus = "success",
  evidenceReference = null,
  occurredAt = new Date(),
  userId = null,
  counterpartyUserId = null,
  adminId = null,
  reversalOf = null,
  settlesJournal = null,
  lines,
  session,
}) => {
  if (!idempotencyKey || !sourceType || !sourceId || !category || !description) {
    throw new Error("Financial journals require an idempotency key, source, category, and description.");
  }
  if (!session?.inTransaction?.()) {
    throw new Error("Financial journals must be posted within the source operation's MongoDB transaction.");
  }
  const normalizedLines = normalizeLines(lines);
  const journalDate = new Date(occurredAt);
  if (!Number.isFinite(journalDate.getTime())) {
    throw new Error("Financial journal occurrence time must be a valid date.");
  }
  const journalData = {
    idempotencyKey: String(idempotencyKey),
    sourceType: String(sourceType),
    serviceType,
    sourceId: String(sourceId),
    sourceReference,
    sourceTransactionId,
    category,
    description: String(description).slice(0, 500),
    sourceStatus,
    evidenceReference,
    currency: "NGN",
    occurredAt: journalDate,
    userId,
    counterpartyUserId,
    adminId,
    reversalOf,
    settlesJournal,
    lines: normalizedLines,
  };
  journalData.fingerprint = fingerprintFor(journalData, normalizedLines);
  const existing = await FinancialJournal.findOne({ idempotencyKey: journalData.idempotencyKey })
    .select("+fingerprint")
    .session(session);
  if (existing) {
    if (existing.fingerprint !== journalData.fingerprint) {
      throw new Error("A financial journal idempotency key was reused with different accounting data.");
    }
    return { journal: existing, created: false };
  }
  const [journal] = await FinancialJournal.create([journalData], { session });
  return { journal, created: true };
};

export const reverseFinancialJournal = async ({
  originalIdempotencyKey,
  idempotencyKey,
  sourceType,
  sourceId,
  sourceReference = null,
  sourceTransactionId = null,
  category = "refund",
  description,
  occurredAt = new Date(),
  session,
}) => {
  const original = await FinancialJournal.findOne({ idempotencyKey: originalIdempotencyKey })
    .session(session);
  if (!original) throw new Error(`Original financial journal ${originalIdempotencyKey} is missing.`);
  return postFinancialJournal({
    idempotencyKey,
    sourceType,
    sourceId,
    sourceReference,
    sourceTransactionId,
    category,
    description,
    occurredAt,
    userId: original.userId,
    counterpartyUserId: original.counterpartyUserId,
    reversalOf: original._id,
    session,
    lines: original.lines.map((line) => ({
      account: line.account,
      debit: line.credit,
      credit: line.debit,
      userId: line.userId,
    })),
  });
};
