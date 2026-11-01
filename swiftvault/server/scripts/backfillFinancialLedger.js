import "dotenv/config";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import FinancialJournal from "../models/FinancialJournal.js";
import FinancialLedgerBackfillIssue from "../models/FinancialLedgerBackfillIssue.js";
import FinancialLedgerControl from "../models/FinancialLedgerControl.js";
import FundingException from "../models/FundingException.js";
import FinancialAuditLog from "../models/FinancialAuditLog.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import { FINANCIAL_ACCOUNTS, postFinancialJournal, reverseFinancialJournal } from "../services/financialLedgerService.js";

const VTU_TYPES = new Set(["airtime", "data_purchase", "cable_tv", "electricity", "epin", "exam_pin"]);
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100);

const post = async (session, journal) => postFinancialJournal({ ...journal, session });

const issueSource = async (sourceType, sourceId, reference, reasonCode, detail) => {
  const existing = await FinancialLedgerBackfillIssue.findOne({ sourceType, sourceId });
  if (existing) return;
  await FinancialLedgerBackfillIssue.create({
    sourceType,
    sourceId: String(sourceId),
    reference: reference || null,
    reasonCode,
    detail: detail.slice(0, 500),
  });
};

const resolveIssue = async (sourceType, sourceId, resolutionReference) =>
  FinancialLedgerBackfillIssue.updateOne(
    { sourceType, sourceId: String(sourceId), status: "open" },
    { $set: { status: "resolved", resolvedAt: new Date(), resolutionReference: String(resolutionReference).slice(0, 200) } }
  );

const reserveBankTransfer = async (session, transaction) => {
  const amount = Number(transaction.amount);
  const fee = Number(transaction.fee || 0);
  return post(session, {
    idempotencyKey: `bank-transfer-reserve:${transaction._id}`,
    sourceType: "bank_transfer_reservation",
    sourceId: transaction._id,
    sourceReference: transaction.reference,
    sourceTransactionId: transaction._id,
    category: "pending_transfer",
    description: "Legacy customer bank transfer reserved pending provider settlement.",
    sourceStatus: transaction.status,
    occurredAt: transaction.createdAt,
    userId: transaction.userId,
    lines: [
      { account: FINANCIAL_ACCOUNTS.customerWallet, debit: amount + fee, userId: transaction.userId },
      { account: FINANCIAL_ACCOUNTS.pendingTransfer, credit: amount },
      ...(fee > 0 ? [{ account: FINANCIAL_ACCOUNTS.pendingTransferFee, credit: fee }] : []),
    ],
  });
};

const settleBankTransfer = async (session, transaction) => {
  const amount = Number(transaction.amount);
  const fee = Number(transaction.fee || 0);
  const lines = [
    { account: FINANCIAL_ACCOUNTS.pendingTransfer, debit: amount },
    { account: FINANCIAL_ACCOUNTS.providerClearing, credit: amount },
  ];
  if (fee > 0) {
    lines.push(
      { account: FINANCIAL_ACCOUNTS.pendingTransferFee, debit: fee },
      { account: FINANCIAL_ACCOUNTS.transferFeeRevenue, credit: fee },
    );
  }
  return post(session, {
    idempotencyKey: `bank-transfer-success:${transaction._id}`,
    sourceType: "bank_transfer_settlement",
    sourceId: transaction._id,
    sourceReference: transaction.reference,
    sourceTransactionId: transaction._id,
    category: fee > 0 ? "transfer_fee" : "customer_transfer",
    description: "Legacy provider-confirmed customer bank transfer.",
    sourceStatus: "success",
    occurredAt: transaction.updatedAt || transaction.createdAt,
    userId: transaction.userId,
    lines,
  });
};

const reserveVtuSale = async (session, transaction) =>
  post(session, {
    idempotencyKey: `vtu-reserve:${transaction._id}`,
    sourceType: "vtu_purchase_reservation",
    sourceId: transaction._id,
    sourceReference: transaction.reference,
    sourceTransactionId: transaction._id,
    serviceType: transaction.type,
    category: "pending_service",
    description: "Legacy customer service purchase reserved pending provider confirmation.",
    sourceStatus: transaction.status,
    occurredAt: transaction.createdAt,
    userId: transaction.userId,
    lines: [
      { account: FINANCIAL_ACCOUNTS.customerWallet, debit: Number(transaction.amount), userId: transaction.userId },
      { account: FINANCIAL_ACCOUNTS.pendingService, credit: Number(transaction.amount) },
    ],
  });

const settleVtuSale = async (session, transaction) => {
  const providerCost = Number(transaction.pricingSnapshot?.reconciledProviderCost);
  const providerFee = Number(transaction.pricingSnapshot?.reconciledProviderFee);
  const lines = [
    { account: FINANCIAL_ACCOUNTS.pendingService, debit: Number(transaction.amount) },
    { account: FINANCIAL_ACCOUNTS.serviceRevenue, credit: Number(transaction.amount) },
  ];
  if (providerCost > 0) lines.push(
    { account: FINANCIAL_ACCOUNTS.providerCostExpense, debit: providerCost },
    { account: FINANCIAL_ACCOUNTS.providerPayable, credit: providerCost },
  );
  if (providerFee > 0) lines.push(
    { account: FINANCIAL_ACCOUNTS.providerFeeExpense, debit: providerFee },
    { account: FINANCIAL_ACCOUNTS.providerPayable, credit: providerFee },
  );
  return post(session, {
    idempotencyKey: `vtu-success:${transaction._id}`,
    sourceType: "vtu_purchase_settlement",
    sourceId: transaction._id,
    sourceReference: transaction.reference,
    sourceTransactionId: transaction._id,
    serviceType: transaction.type,
    category: "service_revenue",
    description: "Legacy provider-confirmed service sale with reconciled actual costs.",
    sourceStatus: "success",
    occurredAt: transaction.updatedAt || transaction.createdAt,
    userId: transaction.userId,
    lines,
  });
};

const postWalletReconciliationIssues = async () => {
  const users = await User.find({ role: { $ne: "admin" } }).select("_id walletBalance bonusBalance").lean();
  const balances = await FinancialJournal.aggregate([
    { $unwind: "$lines" },
    {
      $match: {
        "lines.userId": { $ne: null },
        "lines.account": { $in: [FINANCIAL_ACCOUNTS.customerWallet, FINANCIAL_ACCOUNTS.customerBonusWallet] },
      },
    },
    {
      $group: {
        _id: { userId: "$lines.userId", account: "$lines.account" },
        net: { $sum: { $subtract: ["$lines.credit", "$lines.debit"] } },
      },
    },
  ]);
  const ledgerBalances = new Map(balances.map((row) => [`${row._id.userId}:${row._id.account}`, money(row.net)]));
  for (const user of users) {
    const wallet = money(user.walletBalance || 0);
    const bonus = money(user.bonusBalance || 0);
    const walletLedger = ledgerBalances.get(`${user._id}:${FINANCIAL_ACCOUNTS.customerWallet}`) || 0;
    const bonusLedger = ledgerBalances.get(`${user._id}:${FINANCIAL_ACCOUNTS.customerBonusWallet}`) || 0;
    if (wallet !== walletLedger || bonus !== bonusLedger) {
      await issueSource(
        "wallet_reconciliation",
        user._id,
        null,
        "wallet_balance_mismatch",
        `Stored wallet/bonus balances ${wallet / 100}/${bonus / 100}; ledger balances ${walletLedger / 100}/${bonusLedger / 100}.`,
      );
    } else {
      await resolveIssue("wallet_reconciliation", user._id, "Wallet and bonus balances match ledger subledgers.");
    }
  }
};

export const backfillFinancialLedger = async ({ apply = false, approvalReference = null } = {}) => {
  if (apply && (!approvalReference || approvalReference.trim().length < 3)) {
    throw new Error("Applying a financial backfill requires an approval reference.");
  }

  const transactions = await Transaction.find({}).sort({ createdAt: 1, _id: 1 }).lean();
  const walletsReceived = new Map(
    transactions.filter((transaction) => transaction.type === "wallet_received")
      .map((transaction) => [transaction.reference, transaction])
  );
  const existingSourceIds = new Set(
    (await FinancialJournal.distinct("sourceTransactionId", { sourceTransactionId: { $ne: null } }))
      .map(String)
  );
  const counts = { scanned: transactions.length, alreadyJournaled: 0, postedSources: 0, unresolved: 0 };
  if (!apply) {
    return {
      ...counts,
      plannedSources: transactions.filter((transaction) => !existingSourceIds.has(String(transaction._id))).length,
      note: "Dry run only. No financial journals, issues, or control state were changed.",
    };
  }

  await FinancialLedgerControl.findOneAndUpdate(
    { key: "primary" },
    { $set: { reportingStatus: "backfill_in_progress", backfillStartedAt: new Date(), approvalReference } },
    { upsert: true, new: true },
  );

  for (const transaction of transactions) {
    const transactionId = String(transaction._id);
    if (existingSourceIds.has(transactionId)) {
      counts.alreadyJournaled += 1;
      await resolveIssue("transaction", transactionId, "Source transaction already has ledger postings.");
      continue;
    }

    let unresolved = null;
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      if (transaction.type === "wallet_funding" && transaction.status === "success" && Number(transaction.amount) > 0) {
        await post(session, {
          idempotencyKey: `wallet-funding:${transaction.reference}`,
          sourceType: "monnify_wallet_funding",
          sourceId: transaction._id,
          sourceReference: transaction.reference,
          sourceTransactionId: transaction._id,
          category: "wallet_funding",
          description: "Legacy confirmed customer wallet funding; not business revenue.",
          sourceStatus: "success",
          occurredAt: transaction.createdAt,
          userId: transaction.userId,
          lines: [
            { account: FINANCIAL_ACCOUNTS.providerClearing, debit: Number(transaction.amount) },
            { account: FINANCIAL_ACCOUNTS.customerWallet, credit: Number(transaction.amount), userId: transaction.userId },
          ],
        });
      } else if (transaction.type === "transfer" && transaction.status === "success" &&
        transaction.balanceBefore == null && walletsReceived.has(transaction.reference)) {
        const recipient = walletsReceived.get(transaction.reference);
        const fee = Number(transaction.fee || 0);
        if (money(transaction.amount) !== money(recipient.amount) + money(fee)) {
          unresolved = ["transfer_pair_mismatch", "Sender debit does not equal recipient credit plus recorded fee."];
        } else {
          await post(session, {
            idempotencyKey: `p2p-transfer:${transaction.reference}`,
            sourceType: "internal_wallet_transfer",
            sourceId: transaction.reference,
            sourceReference: transaction.reference,
            sourceTransactionId: transaction._id,
            category: "customer_transfer",
            description: "Legacy internal customer wallet transfer.",
            sourceStatus: "success",
            occurredAt: transaction.createdAt,
            userId: transaction.userId,
            counterpartyUserId: recipient.userId,
            lines: [
              { account: FINANCIAL_ACCOUNTS.customerWallet, debit: Number(transaction.amount), userId: transaction.userId },
              { account: FINANCIAL_ACCOUNTS.customerWallet, credit: Number(recipient.amount), userId: recipient.userId },
              ...(fee > 0 ? [{ account: FINANCIAL_ACCOUNTS.transferFeeRevenue, credit: fee }] : []),
            ],
          });
        }
      } else if (transaction.type === "transfer" && transaction.balanceBefore != null &&
        ["pending", "success", "failed"].includes(transaction.status)) {
        await reserveBankTransfer(session, transaction);
        if (transaction.status === "success") await settleBankTransfer(session, transaction);
        if (transaction.status === "failed") {
          await reverseFinancialJournal({
            originalIdempotencyKey: `legacy:bank-transfer-reserve:${transaction._id}`,
            idempotencyKey: `bank-transfer-refund:${transaction._id}`,
            sourceType: "bank_transfer_refund",
            sourceId: transaction._id,
            sourceReference: transaction.reference,
            sourceTransactionId: transaction._id,
            category: "refund",
            description: "Legacy failed bank transfer reversed.",
            occurredAt: transaction.updatedAt,
            session,
          });
        }
      } else if (transaction.type === "wallet_received") {
        const sender = transactions.find((candidate) =>
          candidate.type === "transfer" && candidate.reference === transaction.reference &&
          candidate.balanceBefore == null
        );
        if (!sender) unresolved = ["orphan_wallet_credit", "No matching successful internal-transfer debit was found."];
      } else if (transaction.type === "upgrade" && transaction.status === "success" &&
        transaction.upgradeAllocation && Number.isFinite(Number(transaction.upgradeAllocation.company))) {
        const referralAmount = Number(transaction.upgradeAllocation.referrer || 0);
        const companyAmount = Number(transaction.upgradeAllocation.company);
        if (money(transaction.amount) !== money(companyAmount + referralAmount) ||
          (referralAmount > 0 && !transaction.upgradeAllocation.referrerUserId)) {
          unresolved = ["upgrade_allocation_incomplete", "Upgrade amount or referral allocation does not reconcile to stored transaction evidence."];
        } else {
          await post(session, {
            idempotencyKey: `membership-upgrade:${transaction._id}`,
            sourceType: "membership_upgrade",
            sourceId: transaction._id,
            sourceReference: transaction.reference,
            sourceTransactionId: transaction._id,
            category: "membership_revenue",
            description: "Legacy confirmed membership upgrade; gross wallet payment recognized.",
            sourceStatus: "success",
            occurredAt: transaction.createdAt,
            userId: transaction.userId,
            lines: [
              { account: FINANCIAL_ACCOUNTS.customerWallet, debit: Number(transaction.amount), userId: transaction.userId },
              { account: FINANCIAL_ACCOUNTS.membershipRevenue, credit: Number(transaction.amount) },
            ],
          });
          if (referralAmount > 0) {
            await post(session, {
              idempotencyKey: `referral-bonus:${transaction._id}`,
              sourceType: "membership_referral_bonus",
              sourceId: transaction._id,
              sourceReference: transaction.reference,
              sourceTransactionId: transaction._id,
              category: "referral_bonus",
              description: "Legacy referral bonus credited to referrer wallet.",
              sourceStatus: "success",
              occurredAt: transaction.createdAt,
              userId: transaction.upgradeAllocation.referrerUserId,
              counterpartyUserId: transaction.userId,
              lines: [
                { account: FINANCIAL_ACCOUNTS.referralExpense, debit: referralAmount },
                { account: FINANCIAL_ACCOUNTS.customerWallet, credit: referralAmount, userId: transaction.upgradeAllocation.referrerUserId },
              ],
            });
          }
        }
      } else if (transaction.type === "admin_adjustment" && transaction.status === "success") {
        const audit = await FinancialAuditLog.findOne({
          reference: transaction.reference,
          operationType: "admin_wallet_adjustment",
        }).lean();
        if (!audit || money(Math.abs(Number(audit.balanceAfter) - Number(audit.balanceBefore))) !== money(transaction.amount)) {
          unresolved = ["admin_adjustment_without_audit", "Matching before/after financial audit evidence is missing or inconsistent."];
        } else {
          const credit = Number(audit.balanceAfter) > Number(audit.balanceBefore);
          await post(session, {
            idempotencyKey: `admin-wallet-adjustment:${transaction.reference}`,
            sourceType: "admin_wallet_adjustment",
            sourceId: transaction.reference,
            sourceReference: transaction.reference,
            sourceTransactionId: transaction._id,
            category: "admin_adjustment",
            description: "Legacy admin wallet adjustment backed by immutable balance audit evidence.",
            sourceStatus: "success",
            occurredAt: transaction.createdAt,
            userId: transaction.userId,
            adminId: audit.admin,
            lines: credit
              ? [
                  { account: FINANCIAL_ACCOUNTS.manualAdjustment, debit: Number(transaction.amount) },
                  { account: FINANCIAL_ACCOUNTS.customerWallet, credit: Number(transaction.amount), userId: transaction.userId },
                ]
              : [
                  { account: FINANCIAL_ACCOUNTS.customerWallet, debit: Number(transaction.amount), userId: transaction.userId },
                  { account: FINANCIAL_ACCOUNTS.manualAdjustment, credit: Number(transaction.amount) },
                ],
          });
        }
      } else if (transaction.type === "company_withdrawal" &&
        ["pending", "success", "failed"].includes(transaction.status)) {
        await post(session, {
          idempotencyKey: `company-withdrawal-reserve:${transaction._id}`,
          sourceType: "company_withdrawal_reservation",
          sourceId: transaction._id,
          sourceReference: transaction.reference,
          sourceTransactionId: transaction._id,
          category: "pending_transfer",
          description: "Legacy company withdrawal reserved pending provider settlement.",
          sourceStatus: transaction.status,
          occurredAt: transaction.createdAt,
          userId: transaction.userId,
          lines: [
            { account: FINANCIAL_ACCOUNTS.pendingCompanyWithdrawal, debit: Number(transaction.amount) },
            { account: FINANCIAL_ACCOUNTS.providerClearing, credit: Number(transaction.amount) },
          ],
        });
        if (transaction.status === "success") {
          await post(session, {
            idempotencyKey: `company-withdrawal-success:${transaction._id}`,
            sourceType: "company_withdrawal_settlement",
            sourceId: transaction._id,
            sourceReference: transaction.reference,
            sourceTransactionId: transaction._id,
            category: "company_withdrawal",
            description: "Legacy provider-confirmed company withdrawal to bank.",
            sourceStatus: "success",
            occurredAt: transaction.updatedAt,
            userId: transaction.userId,
            lines: [
              { account: FINANCIAL_ACCOUNTS.companyBank, debit: Number(transaction.amount) },
              { account: FINANCIAL_ACCOUNTS.pendingCompanyWithdrawal, credit: Number(transaction.amount) },
            ],
          });
        }
        if (transaction.status === "failed") {
          await reverseFinancialJournal({
            originalIdempotencyKey: `company-withdrawal-reserve:${transaction._id}`,
            idempotencyKey: `company-withdrawal-refund:${transaction._id}`,
            sourceType: "company_withdrawal_rejection",
            sourceId: transaction._id,
            sourceReference: transaction.reference,
            sourceTransactionId: transaction._id,
            category: "refund",
            description: "Legacy failed company withdrawal reversed.",
            occurredAt: transaction.updatedAt,
            session,
          });
        }
      } else if (VTU_TYPES.has(transaction.type) && transaction.status === "success") {
        const actualCost = transaction.pricingSnapshot?.reconciledProviderCost;
        const actualFee = transaction.pricingSnapshot?.reconciledProviderFee;
        if (!Number.isFinite(Number(actualCost)) || Number(actualCost) < 0 ||
          !Number.isFinite(Number(actualFee)) || Number(actualFee) < 0) {
          unresolved = ["provider_cost_not_reconciled", "Successful service transaction has no confirmed actual provider cost and fee."];
        } else {
          await reserveVtuSale(session, transaction);
          await settleVtuSale(session, transaction);
        }
      } else if (VTU_TYPES.has(transaction.type) && transaction.status === "pending") {
        await reserveVtuSale(session, transaction);
      } else if (VTU_TYPES.has(transaction.type) && transaction.status === "failed") {
        const refundAudit = await FinancialAuditLog.findOne({
          reference: transaction.reference,
          operationType: "vtu_refund",
          user: transaction.userId,
        }).lean();
        if (!refundAudit || money(Number(refundAudit.balanceAfter) - Number(refundAudit.balanceBefore)) !== money(transaction.amount)) {
          unresolved = ["service_refund_without_evidence", "Failed service transaction lacks audit evidence that the customer wallet was restored."];
        } else {
          await reserveVtuSale(session, transaction);
          await reverseFinancialJournal({
            originalIdempotencyKey: `vtu-reserve:${transaction._id}`,
            idempotencyKey: `vtu-refund:${transaction._id}`,
            sourceType: "vtu_purchase_refund",
            sourceId: transaction._id,
            sourceReference: transaction.reference,
            sourceTransactionId: transaction._id,
            category: "refund",
            description: "Legacy failed service purchase refund supported by balance audit.",
            occurredAt: transaction.updatedAt,
            session,
          });
        }
      } else if (transaction.type === "welcome_bonus" && transaction.status === "success") {
        await post(session, {
          idempotencyKey: `legacy:welcome-bonus:${transaction._id}`,
          sourceType: "welcome_bonus",
          sourceId: transaction._id,
          sourceReference: transaction.reference,
          sourceTransactionId: transaction._id,
          category: "other_expense",
          description: "Legacy welcome bonus credited to customer wallet.",
          sourceStatus: "success",
          occurredAt: transaction.createdAt,
          userId: transaction.userId,
          lines: [
            { account: FINANCIAL_ACCOUNTS.operatingExpense, debit: Number(transaction.amount) },
            { account: FINANCIAL_ACCOUNTS.customerWallet, credit: Number(transaction.amount), userId: transaction.userId },
          ],
        });
      } else if (transaction.type === "referral_upgrade_bonus") {
        const upgradeId = String(transaction.reference || "").replace(/^UPG-REF-/, "");
        if (!upgradeId || !transactions.some((candidate) => String(candidate._id) === upgradeId && candidate.type === "upgrade")) {
          unresolved = ["orphan_referral_bonus", "Referral bonus cannot be linked to a successful originating upgrade."];
        }
      } else {
        unresolved = ["unsupported_or_unverified_source", `No safe evidence-based posting rule exists for ${transaction.type}/${transaction.status}.`];
      }

      if (unresolved) {
        await session.abortTransaction();
        await issueSource("transaction", transactionId, transaction.reference, unresolved[0], unresolved[1]);
        counts.unresolved += 1;
        continue;
      }
      await session.commitTransaction();
      counts.postedSources += 1;
      await resolveIssue("transaction", transactionId, "Evidence-based financial postings committed.");
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();
      await issueSource("transaction", transactionId, transaction.reference, "backfill_posting_failed", error.message || "Posting failed.");
      counts.unresolved += 1;
    } finally {
      await session.endSession();
    }
  }

  const fundingExceptions = await FundingException.find({}).sort({ createdAt: 1, _id: 1 }).lean();
  for (const exception of fundingExceptions) {
    const key = `funding-hold:${exception.paymentReference}`;
    if (await FinancialJournal.exists({ idempotencyKey: key })) continue;
    if (exception.status !== "held") {
      await issueSource(
        "funding_exception",
        exception._id,
        exception.paymentReference,
        "resolved_exception_without_ledger",
        "Funding exception is marked resolved but has no source-supported ledger disposition.",
      );
      continue;
    }
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      await post(session, {
        idempotencyKey: key,
        sourceType: "monnify_funding_hold",
        sourceId: exception._id,
        sourceReference: exception.paymentReference,
        category: "funding_suspense",
        description: `Monnify funding held: ${exception.reasonCode}`,
        sourceStatus: "held",
        occurredAt: exception.createdAt,
        userId: exception.userId,
        lines: [
          { account: FINANCIAL_ACCOUNTS.providerClearing, debit: Number(exception.amount) },
          { account: FINANCIAL_ACCOUNTS.fundingSuspense, credit: Number(exception.amount) },
        ],
      });
      await session.commitTransaction();
      await resolveIssue("funding_exception", exception._id, "Held funding exception posted to funding suspense.");
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();
      await issueSource("funding_exception", exception._id, exception.paymentReference, "funding_hold_posting_failed", error.message || "Funding hold posting failed.");
    } finally {
      await session.endSession();
    }
  }

  await postWalletReconciliationIssues();
  const unresolvedSourceCount = await FinancialLedgerBackfillIssue.countDocuments({ status: "open" });
  const reportingStatus = unresolvedSourceCount === 0 ? "ready" : "needs_review";
  await FinancialLedgerControl.findOneAndUpdate(
    { key: "primary" },
    {
      $set: {
        reportingStatus,
        unresolvedSourceCount,
        backfillCompletedAt: new Date(),
        approvalReference,
      },
    },
    { upsert: true, new: true },
  );
  return { ...counts, unresolvedSourceCount, reportingStatus, approvalReference };
};

const run = async () => {
  const apply = process.argv.includes("--apply");
  const approvalReferenceIndex = process.argv.indexOf("--approval-reference");
  const approvalReference = approvalReferenceIndex >= 0 ? process.argv[approvalReferenceIndex + 1] : null;
  if (apply && process.env.FINANCIAL_LEDGER_BACKFILL_APPROVED !== "true") {
    throw new Error("Set FINANCIAL_LEDGER_BACKFILL_APPROVED=true only after the accounting owner approves this run.");
  }
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required.");
  await mongoose.connect(process.env.MONGO_URI);
  const expectedDatabase = process.env.FINANCIAL_LEDGER_BACKFILL_DB_NAME;
  const actualDatabase = mongoose.connection.db.databaseName;
  if (apply && (!expectedDatabase || expectedDatabase !== actualDatabase)) {
    throw new Error("Set FINANCIAL_LEDGER_BACKFILL_DB_NAME to the exact target database name before applying.");
  }
  if (apply) {
    await FinancialJournal.createIndexes();
    await FinancialLedgerBackfillIssue.createIndexes();
  }
  const result = await backfillFinancialLedger({ apply, approvalReference });
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
  if (result.reportingStatus === "needs_review") process.exitCode = 2;
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run().catch(async (error) => {
    console.error("Financial ledger backfill failed:", error.message);
    if (mongoose.connection.readyState) await mongoose.disconnect();
    process.exitCode = 1;
  });
}
