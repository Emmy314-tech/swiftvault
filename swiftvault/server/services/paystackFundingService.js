import mongoose from "mongoose";
import FundingException from "../models/FundingException.js";
import KycProfile from "../models/KycProfile.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import { getCurrentKycTier, getFundingHoldReason, getTransactionPolicy } from "./kycPolicyService.js";
import { recordFinancialAudit } from "./financialAuditService.js";
import { FINANCIAL_ACCOUNTS, postFinancialJournal } from "./financialLedgerService.js";
import { sendNotification } from "./notificationService.js";
import { emitWalletUpdate } from "../socket/walletSocket.js";
import { matchPaystackPayment } from "./paystackGateway.js";

const defaultDependencies = {
  startSession: () => mongoose.startSession(),
  FundingException,
  KycProfile,
  Transaction,
  User,
  getCurrentKycTier,
  getFundingHoldReason,
  getTransactionPolicy,
  postFinancialJournal,
  recordFinancialAudit,
  sendNotification,
  emitWalletUpdate,
};

export const settleVerifiedPaystackPayment = async (payment, dependencies = {}, expectedReference = payment?.reference) => {
  const deps = { ...defaultDependencies, ...dependencies };
  const session = await deps.startSession();
  let outcome = { result: "not_found" };
  let settledUser = null;
  let balanceBefore = null;
  let transaction = null;

  try {
    await session.withTransaction(async () => {
      transaction = await deps.Transaction.findOne({
        reference: expectedReference,
        type: "wallet_funding",
        provider: "paystack",
      }).session(session);

      if (!transaction) {
        outcome = { result: "not_found" };
        return;
      }
      if (transaction.status !== "pending") {
        outcome = { result: "duplicate", status: transaction.status };
        return;
      }

      const validation = matchPaystackPayment(payment, {
        _id: transaction._id,
        userId: transaction.userId,
        reference: transaction.reference,
        expectedAmountKobo: transaction.expectedAmountKobo,
        currency: transaction.fundingCurrency,
        customerEmail: transaction.fundingEmail,
        providerCustomerCode: transaction.providerCustomerCode,
      });
      if (validation.outcome === "invalid") {
        outcome = { result: "invalid", reason: validation.reason };
        return;
      }
      if (validation.outcome === "pending") {
        outcome = { result: "pending" };
        return;
      }

      const claimed = await deps.Transaction.findOneAndUpdate(
        { _id: transaction._id, status: "pending", provider: "paystack" },
        { $set: { status: "processing" } },
        { new: true, session }
      );
      if (!claimed) {
        outcome = { result: "duplicate" };
        return;
      }
      transaction = claimed;

      if (validation.outcome === "failed") {
        transaction.status = "failed";
        transaction.verifiedAt = new Date();
        await transaction.save({ session });
        outcome = { result: "failed" };
        return;
      }

      const user = await deps.User.findById(transaction.userId).session(session);
      const kycProfile = user
        ? await deps.KycProfile.findOne({ userId: user._id }).session(session)
        : null;
      const tier = deps.getCurrentKycTier(kycProfile);
      const policy = await deps.getTransactionPolicy();
      const amount = transaction.expectedAmountKobo / 100;
      const holdReason = deps.getFundingHoldReason({
        user,
        tier,
        policy,
        amount,
        fundingMethod: "paystack",
      });

      if (holdReason) {
        const [exception] = await deps.FundingException.create([{
          paymentReference: transaction.reference,
          accountReference: transaction.reference,
          userId: user?._id || null,
          amount,
          currency: "NGN",
          status: "held",
          reasonCode: holdReason,
        }], { session });
        await deps.postFinancialJournal({
          idempotencyKey: `funding-hold:${transaction.reference}`,
          sourceType: "paystack_funding_hold",
          sourceId: exception._id,
          sourceReference: transaction.reference,
          category: "funding_suspense",
          description: `Paystack funding held: ${holdReason}`,
          sourceStatus: "held",
          occurredAt: exception.createdAt || new Date(),
          userId: user?._id || null,
          session,
          lines: [
            { account: FINANCIAL_ACCOUNTS.providerClearing, debit: amount },
            { account: FINANCIAL_ACCOUNTS.fundingSuspense, credit: amount },
          ],
        });
        transaction.status = "held";
        transaction.verifiedAt = new Date();
        await transaction.save({ session });
        outcome = { result: "held", reason: holdReason, amount };
        return;
      }

      balanceBefore = Number(user.walletBalance) || 0;
      user.walletBalance = balanceBefore + amount;
      await user.save({ session });
      transaction.balanceBefore = balanceBefore;
      transaction.status = "success";
      transaction.verifiedAt = new Date();
      await transaction.save({ session });
      await deps.postFinancialJournal({
        idempotencyKey: `wallet-funding:${transaction.reference}`,
        sourceType: "paystack_wallet_funding",
        sourceId: transaction._id,
        sourceReference: transaction.reference,
        sourceTransactionId: transaction._id,
        category: "wallet_funding",
        description: "Customer wallet funded through Paystack after server-side verification.",
        occurredAt: transaction.verifiedAt,
        userId: user._id,
        session,
        lines: [
          { account: FINANCIAL_ACCOUNTS.providerClearing, debit: amount },
          { account: FINANCIAL_ACCOUNTS.customerWallet, credit: amount, userId: user._id },
        ],
      });
      settledUser = user;
      outcome = { result: "success", amount, balanceAfter: user.walletBalance };
    });

    if (outcome.result === "success") {
      deps.emitWalletUpdate(settledUser._id, settledUser.walletBalance);
      await deps.recordFinancialAudit({
        user: settledUser._id,
        operationType: "wallet_funding",
        amount: outcome.amount,
        balanceBefore,
        balanceAfter: settledUser.walletBalance,
        source: "paystack_verification",
        reference: transaction.reference,
        reason: "Server-verified Paystack wallet funding",
      });
      await deps.sendNotification({
        userId: settledUser._id,
        title: "Wallet Funded",
        message: `Your wallet has been credited with ₦${outcome.amount.toLocaleString()}.`,
        type: "wallet",
        icon: "💳",
        priority: "normal",
        actionUrl: "/wallet",
      });
    }
    return outcome;
  } finally {
    await session.endSession();
  }
};

const getPaystackCustomerCode = (payment) =>
  payment?.customer?.customer_code || payment?.customer?.code || null;

const holdUnmatchedPaystackPayment = async (payment, dependencies) => {
  const deps = { ...defaultDependencies, ...dependencies };
  const session = await deps.startSession();
  let result = "held";
  try {
    await session.withTransaction(async () => {
      const existing = await deps.FundingException.findOne({ paymentReference: payment.reference }).session(session);
      if (existing) {
        result = "duplicate";
        return;
      }
      const amount = payment.amount / 100;
      const [exception] = await deps.FundingException.create([{
        paymentReference: payment.reference,
        accountReference: getPaystackCustomerCode(payment) || payment.reference,
        userId: null,
        amount,
        currency: "NGN",
        status: "held",
        reasonCode: "account_unmatched",
      }], { session });
      await deps.postFinancialJournal({
        idempotencyKey: `funding-hold:${payment.reference}`,
        sourceType: "paystack_funding_hold",
        sourceId: exception._id,
        sourceReference: payment.reference,
        category: "funding_suspense",
        description: "Paystack dedicated-account payment held: account_unmatched",
        sourceStatus: "held",
        occurredAt: exception.createdAt || new Date(),
        session,
        lines: [
          { account: FINANCIAL_ACCOUNTS.providerClearing, debit: amount },
          { account: FINANCIAL_ACCOUNTS.fundingSuspense, credit: amount },
        ],
      });
    });
    return { result, reason: "account_unmatched" };
  } finally {
    await session.endSession();
  }
};

export const settleVerifiedPaystackDedicatedTransfer = async (payment, dependencies = {}) => {
  const customerCode = getPaystackCustomerCode(payment);
  if (
    !customerCode ||
    payment?.authorization?.channel !== "dedicated_nuban" ||
    !Number.isSafeInteger(payment.amount) || payment.amount <= 0 ||
    payment.currency !== "NGN" || payment.status !== "success" ||
    typeof payment.reference !== "string" || !payment.reference
  ) {
    return { result: "invalid", reason: "payment_mismatch" };
  }

  const deps = { ...defaultDependencies, ...dependencies };
  const user = await deps.User.findOne({
    "paystackCustomer.customerCode": customerCode,
    "paystackCustomer.dedicatedAccountStatus": "active",
  }).select("+paystackCustomer");
  if (!user) return holdUnmatchedPaystackPayment(payment, deps);

  let transaction = await deps.Transaction.findOne({
    reference: payment.reference,
    type: "wallet_funding",
    provider: "paystack",
  });
  if (transaction) {
    if (String(transaction.userId) !== String(user._id) || transaction.fundingMode !== "dedicated_account") {
      return { result: "invalid", reason: "reference_conflict" };
    }
  } else {
    try {
      [transaction] = await deps.Transaction.create([{
        userId: user._id,
        type: "wallet_funding",
        provider: "paystack",
        fundingMode: "dedicated_account",
        providerCustomerCode: customerCode,
        amount: payment.amount / 100,
        expectedAmountKobo: payment.amount,
        fundingCurrency: "NGN",
        fundingEmail: user.email,
        description: "Paystack dedicated-account wallet funding",
        status: "pending",
        reference: payment.reference,
      }]);
    } catch (error) {
      if (error.code !== 11000) throw error;
      transaction = await deps.Transaction.findOne({
        reference: payment.reference,
        type: "wallet_funding",
        provider: "paystack",
      });
      if (!transaction || String(transaction.userId) !== String(user._id) || transaction.fundingMode !== "dedicated_account") {
        return { result: "invalid", reason: "reference_conflict" };
      }
    }
  }

  return settleVerifiedPaystackPayment(payment, deps, payment.reference);
};