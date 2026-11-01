import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { FINANCIAL_ACCOUNTS, postFinancialJournal, reverseFinancialJournal } from "./financialLedgerService.js";

export const recordPendingVtuSale = async (transaction, session) =>
  postFinancialJournal({
    idempotencyKey: `vtu-reserve:${transaction._id}`,
    sourceType: "vtu_purchase_reservation",
    sourceId: transaction._id,
    sourceReference: transaction.reference,
    sourceTransactionId: transaction._id,
    category: "pending_service",
    description: "Customer service purchase reserved pending provider confirmation.",
    sourceStatus: "pending",
    occurredAt: transaction.createdAt || new Date(),
    userId: transaction.userId,
    session,
    lines: [
      ...(Number(transaction.walletAllocation?.wallet ?? transaction.amount) > 0
        ? [{
          account: FINANCIAL_ACCOUNTS.customerWallet,
          debit: Number(transaction.walletAllocation?.wallet ?? transaction.amount),
          userId: transaction.userId,
        }]
        : []),
      ...(Number(transaction.walletAllocation?.bonus || 0) > 0
        ? [{
          account: FINANCIAL_ACCOUNTS.customerBonusWallet,
          debit: Number(transaction.walletAllocation.bonus),
          userId: transaction.userId,
        }]
        : []),
      { account: FINANCIAL_ACCOUNTS.pendingService, credit: transaction.amount },
    ],
  });

export const refundPendingVtuPurchase = async (transactionId, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transaction = await Transaction.findOneAndUpdate(
      { _id: transactionId, userId, status: "pending" },
      { $set: { status: "failed" } },
      { new: true, session }
    );

    if (!transaction) {
      await session.abortTransaction();
      return false;
    }

    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found while refunding VTU purchase.");

    const walletAllocation = transaction.walletAllocation || { wallet: transaction.amount, bonus: 0 };
    user.walletBalance += Number(walletAllocation.wallet || 0);
    user.bonusBalance = Number(user.bonusBalance || 0) + Number(walletAllocation.bonus || 0);
    await user.save({ session });
    await reverseFinancialJournal({
      originalIdempotencyKey: `vtu-reserve:${transaction._id}`,
      idempotencyKey: `vtu-refund:${transaction._id}`,
      sourceType: "vtu_purchase_refund",
      sourceId: transaction._id,
      sourceReference: transaction.reference,
      sourceTransactionId: transaction._id,
      category: "refund",
      description: "Failed service purchase reversed; customer wallet liability restored.",
      occurredAt: transaction.updatedAt || new Date(),
      session,
    });
    await session.commitTransaction();
    return true;
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};