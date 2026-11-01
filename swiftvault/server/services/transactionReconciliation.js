import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import ReconciliationAttempt from "../models/ReconciliationAttempt.js";
import { sendNotification } from "./notificationService.js";
import {
  addCableProfit,
  addEducationProfit,
  addEpinProfit,
  addElectricityProfit,
  addTransferFee,
  addVTUProfit,
  getCompanyWallet,
  refundWithdrawal,
} from "./companyWalletService.js";
import { recordFinancialAudit } from "./financialAuditService.js";
import { emitWalletUpdate } from "../socket/walletSocket.js";
import { FINANCIAL_ACCOUNTS, postFinancialJournal, reverseFinancialJournal } from "./financialLedgerService.js";

const VTU_TYPES = new Set(["airtime", "data_purchase", "cable_tv", "electricity", "epin", "exam_pin"]);

const addVtuMargin = async (transaction, session) => {
  if (!Number.isFinite(transaction.pricingSnapshot?.reconciledProviderCost) ||
    !Number.isFinite(transaction.pricingSnapshot?.reconciledProviderFee)) {
    throw new Error("VTU margin requires provider charges confirmed during reconciliation.");
  }
  const margin = Number(transaction.amount) - Number(transaction.providerCost) - Number(transaction.providerFee || 0);
  if (margin === 0) return;

  const addProfit = {
    airtime: addVTUProfit,
    data_purchase: addVTUProfit,
    cable_tv: addCableProfit,
    electricity: addElectricityProfit,
    epin: addEpinProfit,
    exam_pin: addEducationProfit,
  }[transaction.type];
  await addProfit(margin, session);
};

const postVtuSaleSettlement = async (transaction, session) => {
  const providerCost = Number(transaction.pricingSnapshot?.reconciledProviderCost);
  const providerFee = Number(transaction.pricingSnapshot?.reconciledProviderFee);
  if (!Number.isFinite(providerCost) || providerCost < 0 || !Number.isFinite(providerFee) || providerFee < 0) {
    throw new Error("A VTU ledger settlement requires reconciled provider charges.");
  }
  const lines = [
    { account: FINANCIAL_ACCOUNTS.pendingService, debit: transaction.amount },
    { account: FINANCIAL_ACCOUNTS.serviceRevenue, credit: transaction.amount },
  ];
  if (providerCost > 0) {
    lines.push(
      { account: FINANCIAL_ACCOUNTS.providerCostExpense, debit: providerCost },
      { account: FINANCIAL_ACCOUNTS.providerPayable, credit: providerCost },
    );
  }
  if (providerFee > 0) {
    lines.push(
      { account: FINANCIAL_ACCOUNTS.providerFeeExpense, debit: providerFee },
      { account: FINANCIAL_ACCOUNTS.providerPayable, credit: providerFee },
    );
  }
  return postFinancialJournal({
    idempotencyKey: `vtu-success:${transaction._id}`,
    sourceType: "vtu_purchase_settlement",
    serviceType: transaction.type,
    sourceId: transaction._id,
    sourceReference: transaction.reference,
    sourceTransactionId: transaction._id,
    category: "service_revenue",
    description: `Provider-confirmed ${transaction.type} sale and reconciled provider costs.`,
    sourceStatus: "success",
    occurredAt: transaction.updatedAt || new Date(),
    userId: transaction.userId,
    session,
    lines,
  });
};

const logAttempt = async ({
  transaction,
  provider,
  actor,
  mode,
  requestedOutcome = "check",
  observedStatus = null,
  result,
  reason = "",
  req,
  session,
}) => ReconciliationAttempt.create([{
  transactionId: transaction._id,
  reference: transaction.reference,
  provider,
  actor: actor?._id || actor || null,
  mode,
  requestedOutcome,
  observedStatus,
  result,
  reason: String(reason).slice(0, 1000),
  ipAddress: req?.ip || "Unknown",
}], session ? { session } : {});

export const recordPendingReconciliationAttempt = async (options) => {
  await logAttempt({ ...options, result: options.result || "pending" });
};

export const settlePendingTransaction = async ({
  transactionId,
  reference,
  provider,
  finalStatus,
  observedStatus,
  actor = null,
  mode,
  reason = "",
  providerCost,
  providerFee,
  req,
}) => {
  if (!["success", "failed", null].includes(finalStatus)) {
    throw new Error("Unsupported reconciliation outcome.");
  }

  const session = await mongoose.startSession();
  let userUpdate = null;
  let companyBalanceBefore = null;
  let companyBalanceAfter = null;
  let settledTransaction = null;
  let successNotification = null;
  let successAuditData = null;

  try {
    session.startTransaction();
    const providerTypes = provider === "peyflex" ? [...VTU_TYPES] : [];
    if (providerTypes.length === 0) throw new Error("Unsupported reconciliation provider.");

    const filter = {
      status: "pending",
      type: { $in: providerTypes },
      ...(transactionId ? { _id: transactionId } : { reference }),
    };
    let pending = await Transaction.findOne(filter).session(session);

    if (!pending) {
      const existing = await Transaction.findOne({
        ...(transactionId ? { _id: transactionId } : { reference }),
        type: { $in: providerTypes },
      }).session(session);
      if (existing) {
        await logAttempt({ transaction: existing, provider, actor, mode, requestedOutcome: finalStatus || "check", observedStatus, result: "already_settled", reason, req, session });
        await session.commitTransaction();
        return { result: "already_settled", transaction: existing };
      }
      await session.abortTransaction();
      return { result: "not_found" };
    }

    if (finalStatus === "success" && VTU_TYPES.has(pending.type)) {
      if (providerCost === undefined || providerCost === null || providerCost === "" ||
        providerFee === undefined || providerFee === null || providerFee === "" ||
        !Number.isFinite(Number(providerCost)) || Number(providerCost) < 0 ||
        !Number.isFinite(Number(providerFee)) || Number(providerFee) < 0) {
        throw new Error("Confirmed provider cost and fee are required before successful VTU settlement.");
      }
      pending.providerCost = Number(providerCost);
      pending.providerFee = Number(providerFee);
    } else {
      if (providerCost !== undefined) pending.providerCost = Number(providerCost);
      if (providerFee !== undefined) pending.providerFee = Number(providerFee);
    }

    if (!finalStatus) {
      await logAttempt({ transaction: pending, provider, actor, mode, observedStatus, result: "pending", reason, req, session });
      await session.commitTransaction();
      return { result: "pending", transaction: pending };
    }

    const reconciliationSet = {
      status: finalStatus,
      ...(providerCost !== undefined ? { providerCost: Number(providerCost) } : {}),
      ...(providerFee !== undefined ? { providerFee: Number(providerFee) } : {}),
    };
    if (finalStatus === "success" && VTU_TYPES.has(pending.type)) {
      reconciliationSet.pricingSnapshot = {
        ...(pending.pricingSnapshot || {}),
        providerChargeStatus: "reconciled_actual",
        reconciledProviderCost: Number(pending.providerCost),
        reconciledProviderFee: Number(pending.providerFee || 0),
        reconciledAt: new Date(),
        grossMargin: Number(pending.amount) - Number(pending.providerCost) - Number(pending.providerFee || 0),
      };
    }
    const claimed = await Transaction.findOneAndUpdate(
      filter,
      { $set: reconciliationSet },
      { new: true, session }
    );

    if (!claimed) {
      await session.abortTransaction();
      await logAttempt({
        transaction: pending,
        provider,
        actor,
        mode,
        requestedOutcome: finalStatus,
        observedStatus,
        result: "already_settled",
        reason: "A concurrent callback or reconciliation already changed this transaction.",
        req,
      });
      return { result: "already_settled" };
    }
    settledTransaction = claimed;

    if (finalStatus === "failed") {
      if (claimed.type === "company_withdrawal") {
        const wallet = await getCompanyWallet(session);
        companyBalanceBefore = wallet.balance;
        await refundWithdrawal(claimed.amount, session);
        companyBalanceAfter = companyBalanceBefore + claimed.amount;
        await reverseFinancialJournal({
          originalIdempotencyKey: `company-withdrawal-reserve:${claimed._id}`,
          idempotencyKey: `company-withdrawal-refund:${claimed._id}`,
          sourceType: "company_withdrawal_rejection",
          sourceId: claimed._id,
          sourceReference: claimed.reference,
          sourceTransactionId: claimed._id,
          category: "refund",
          description: "Failed company withdrawal reversed; provider-clearing balance restored.",
          occurredAt: claimed.updatedAt || new Date(),
          session,
        });
      } else {
        const user = await User.findById(claimed.userId).session(session);
        if (!user) throw new Error("Transaction owner not found during reconciliation.");
        const balanceBefore = user.walletBalance || 0;
        if (VTU_TYPES.has(claimed.type)) {
          const allocation = claimed.walletAllocation || { wallet: claimed.amount, bonus: 0 };
          user.walletBalance = balanceBefore + Number(allocation.wallet || 0);
          user.bonusBalance = Number(user.bonusBalance || 0) + Number(allocation.bonus || 0);
        } else {
          user.walletBalance = balanceBefore + claimed.amount + (claimed.type === "transfer" ? claimed.fee || 0 : 0);
        }
        await user.save({ session });
        userUpdate = {
          user,
          transactionType: claimed.type,
          amount: claimed.amount,
          balanceBefore,
          balanceAfter: user.walletBalance,
        };
        if (claimed.type === "transfer") {
          await reverseFinancialJournal({
            originalIdempotencyKey: `bank-transfer-reserve:${claimed._id}`,
            idempotencyKey: `bank-transfer-refund:${claimed._id}`,
            sourceType: "bank_transfer_refund",
            sourceId: claimed._id,
            sourceReference: claimed.reference,
            sourceTransactionId: claimed._id,
            category: "refund",
            description: "Failed bank transfer reversed; customer wallet liability restored.",
            occurredAt: claimed.updatedAt || new Date(),
            session,
          });
        } else if (VTU_TYPES.has(claimed.type)) {
          await reverseFinancialJournal({
            originalIdempotencyKey: `vtu-reserve:${claimed._id}`,
            idempotencyKey: `vtu-refund:${claimed._id}`,
            sourceType: "vtu_purchase_refund",
            sourceId: claimed._id,
            sourceReference: claimed.reference,
            sourceTransactionId: claimed._id,
            category: "refund",
            description: "Failed service purchase reversed; customer wallet liability restored.",
            occurredAt: claimed.updatedAt || new Date(),
            session,
          });
        }
      }
    } else if (claimed.type === "transfer" && claimed.fee > 0) {
      await addTransferFee(claimed.fee, session);
      await postFinancialJournal({
        idempotencyKey: `bank-transfer-success:${claimed._id}`,
        sourceType: "bank_transfer_settlement",
        sourceId: claimed._id,
        sourceReference: claimed.reference,
        sourceTransactionId: claimed._id,
        category: "transfer_fee",
        description: "Provider-confirmed bank transfer and earned fee.",
        sourceStatus: "success",
        occurredAt: claimed.updatedAt || new Date(),
        userId: claimed.userId,
        session,
        lines: [
          { account: FINANCIAL_ACCOUNTS.pendingTransfer, debit: claimed.amount },
          { account: FINANCIAL_ACCOUNTS.providerClearing, credit: claimed.amount },
          { account: FINANCIAL_ACCOUNTS.pendingTransferFee, debit: claimed.fee },
          { account: FINANCIAL_ACCOUNTS.transferFeeRevenue, credit: claimed.fee },
        ],
      });
    } else if (claimed.type === "transfer") {
      await postFinancialJournal({
        idempotencyKey: `bank-transfer-success:${claimed._id}`,
        sourceType: "bank_transfer_settlement",
        sourceId: claimed._id,
        sourceReference: claimed.reference,
        sourceTransactionId: claimed._id,
        category: "customer_transfer",
        description: "Provider-confirmed bank transfer.",
        sourceStatus: "success",
        occurredAt: claimed.updatedAt || new Date(),
        userId: claimed.userId,
        session,
        lines: [
          { account: FINANCIAL_ACCOUNTS.pendingTransfer, debit: claimed.amount },
          { account: FINANCIAL_ACCOUNTS.providerClearing, credit: claimed.amount },
        ],
      });
    } else if (VTU_TYPES.has(claimed.type)) {
      await addVtuMargin(claimed, session);
      await postVtuSaleSettlement(claimed, session);
    } else if (claimed.type === "company_withdrawal") {
      await postFinancialJournal({
        idempotencyKey: `company-withdrawal-success:${claimed._id}`,
        sourceType: "company_withdrawal_settlement",
        sourceId: claimed._id,
        sourceReference: claimed.reference,
        sourceTransactionId: claimed._id,
        category: "company_withdrawal",
        description: "Provider-confirmed transfer from provider clearing to company bank.",
        sourceStatus: "success",
        occurredAt: claimed.updatedAt || new Date(),
        userId: claimed.userId,
        session,
        lines: [
          { account: FINANCIAL_ACCOUNTS.companyBank, debit: claimed.amount },
          { account: FINANCIAL_ACCOUNTS.pendingCompanyWithdrawal, credit: claimed.amount },
        ],
      });
    }

    if (finalStatus === "success") {
      if (claimed.type === "company_withdrawal") {
        successAuditData = {
          admin: actor?._id || actor,
          operationType: "company_withdrawal",
          amount: claimed.amount,
          balanceBefore: claimed.balanceBefore,
          balanceAfter: Number(claimed.balanceBefore) - Number(claimed.amount),
          source: `reconciliation_${mode}`,
          destination: claimed.description,
          reference: claimed.reference,
          reason: reason || "Provider-confirmed company withdrawal success",
          req,
        };
      } else {
        successNotification = {
          userId: claimed.userId,
          title: "Transaction Confirmed",
          message: "Your pending transaction has been confirmed by the provider.",
          type: "transfer",
          priority: "normal",
          actionUrl: "/transactions",
        };
      }
      if (claimed.type === "transfer" || VTU_TYPES.has(claimed.type)) {
        successAuditData = {
          user: claimed.userId,
          operationType: claimed.type === "transfer" ? "bank_transfer" : "vtu_purchase",
          amount: claimed.type === "transfer" ? claimed.amount + (claimed.fee || 0) : claimed.amount,
          balanceBefore: claimed.balanceBefore,
          balanceAfter: Number(claimed.balanceBefore) - Number(claimed.amount) - (claimed.type === "transfer" ? claimed.fee || 0 : 0),
          source: `reconciliation_${mode}`,
          destination: claimed.recipient?.name || null,
          reference: claimed.reference,
          reason: reason || "Provider-confirmed transaction success",
          req,
        };
      }
    }

    await logAttempt({ transaction: claimed, provider, actor, mode, requestedOutcome: finalStatus, observedStatus, result: "resolved", reason, req, session });
    await session.commitTransaction();
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }

  if (userUpdate) {
    emitWalletUpdate(userUpdate.user._id, userUpdate.balanceAfter);
    await recordFinancialAudit({
      user: userUpdate.user._id,
      admin: actor?._id || actor,
      operationType: userUpdate.transactionType === "transfer" ? "bank_transfer" : "vtu_refund",
      amount: userUpdate.amount,
      balanceBefore: userUpdate.balanceBefore,
      balanceAfter: userUpdate.balanceAfter,
      source: `reconciliation_${mode}`,
      reference,
      reason: reason || "Provider-confirmed transaction failure",
      req,
    });
    await sendNotification({
      userId: userUpdate.user._id,
      title: "Transaction Reversed",
      message: "A failed transaction was refunded to your wallet.",
      type: "wallet",
      priority: "high",
      actionUrl: "/transactions",
    });
  }

  if (companyBalanceBefore !== null) {
    await recordFinancialAudit({
      admin: actor?._id || actor,
      operationType: "company_withdrawal",
      amount: settledTransaction.amount,
      balanceBefore: companyBalanceBefore,
      balanceAfter: companyBalanceAfter,
      source: `reconciliation_${mode}`,
      reference,
      reason: reason || "Provider-confirmed withdrawal failure",
      req,
    });
  }

  if (successNotification) await sendNotification(successNotification);
  if (successAuditData && Number.isFinite(successAuditData.balanceBefore) && Number.isFinite(successAuditData.balanceAfter)) {
    await recordFinancialAudit(successAuditData);
  }

  return { result: "resolved", transaction: settledTransaction };
};