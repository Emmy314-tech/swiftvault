import crypto from "crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Transfer from "../models/Transfer.js";
import Transaction from "../models/Transaction.js";
import Beneficiary from "../models/Beneficiary.js";
import { sendNotification } from "../services/notificationService.js";
import { normalizePhone } from "../utils/normalizePhone.js";
import { emitWalletUpdate } from "../socket/walletSocket.js";
import { recordFinancialAudit } from "../services/financialAuditService.js";
import { checkFraud } from "../services/fraudService.js";
import { addTransferFee } from "../services/companyWalletService.js";
import { FINANCIAL_ACCOUNTS, postFinancialJournal } from "../services/financialLedgerService.js";
import { isPositiveFiniteAmount } from "../utils/financialValidation.js";

// LAYER 1: SMART RECIPIENT LOOKUP
export const lookupRecipient = async (req, res) => {
  try {
    const phone = normalizePhone(req.params.phone);
    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(200).json({
        success: false,
        exists: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      exists: true,
      fullName: user.fullName,
      username: user.username,
      phone: user.phone,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// LAYER 2, 3, 4, 5 & 6: MONETARY MOVEMENT ENGINE
export const sendMoney = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const senderId = req.user.id;
    let { phone, amount, pin, narration } = req.body;

    phone = normalizePhone(phone);
    amount = Number(amount);

    if (!isPositiveFiniteAmount(amount)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid transfer amount" });
    }

    const sender = await User.findById(senderId).session(session);
    if (!sender) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Sender profile not found" });
    }

// Reset daily transfer statistics if it's a new day
const today = new Date();

if (
  !sender.dailyTransferDate ||
  sender.dailyTransferDate.toDateString() !== today.toDateString()
) {
  sender.dailyTransferAmount = 0;
  sender.rapidTransferCount = 0;
}

    // LAYER 4: SECURITY - Check if account PIN is locked
    if (sender.pinLockedUntil && sender.pinLockedUntil > Date.now()) {
      const waitTime = Math.ceil((sender.pinLockedUntil - Date.now()) / 1000 / 60);
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        message: `PIN temporarily locked. Try again in ${waitTime} minutes.`,
      });
    }

    if (!sender.pin) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Please configure your transaction PIN first" });
    }
const fraudCheck = await checkFraud(sender, amount);

if (!fraudCheck.allowed) {
  await session.abortTransaction();
  session.endSession();

  return res.status(403).json({
    success: false,
    message: fraudCheck.reason,
  });
}

    // LAYER 4: SECURITY - PIN Authentication & Counter Check
    const validPin = await bcrypt.compare(pin, sender.pin);
    if (!validPin) {
      sender.pinAttempts = (sender.pinAttempts || 0) + 1;
      if (sender.pinAttempts >= 3) {
        sender.pinLockedUntil = Date.now() + 15 * 60 * 1000; // 15 Min penalty
        await sender.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(403).json({ message: "Incorrect PIN. Account locked for 15 minutes." });
      }
      await sender.save({ session });
      await session.commitTransaction();
      session.endSession();
      return res.status(400).json({ message: `Incorrect PIN. ${3 - sender.pinAttempts} attempts remaining.` });
    }

    // Fetch Recipient
    const receiver = await User.findOne({ phone }).session(session);
    if (!receiver) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Recipient not found" });
    }

    if (String(sender._id) === String(receiver._id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Self-transfers are not permitted." });
    }

    // LAYER 3: TRANSFER FEES SYSTEM
    const fee = 0;
    const totalDebit = amount + fee;

    if (sender.walletBalance < totalDebit) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Insufficient balance to cover transfer and fees" });
    }

    // Execution: Reset Security metrics upon clean authentication
    sender.pinAttempts = 0;
    sender.pinLockedUntil = null;
// Update fraud monitoring statistics
sender.dailyTransferAmount =
  (sender.dailyTransferAmount || 0) + amount;

sender.dailyTransferDate = new Date();

sender.lastTransferAt = new Date();

sender.rapidTransferCount =
  (sender.rapidTransferCount || 0) + 1;

    // Mutate ledger balances safely
    const senderBalanceBefore = sender.walletBalance;
    const receiverBalanceBefore = receiver.walletBalance;
    sender.walletBalance -= totalDebit;
    receiver.walletBalance += amount;

    await sender.save({ session });
    await receiver.save({ session });

    const reference = crypto.randomUUID();

    // LAYER 2: BENEFICIARY SYSTEM - Auto-save / Upsert
    await Beneficiary.findOneAndUpdate(
      { userId: senderId, phone: receiver.phone },
      { userId: senderId, name: receiver.fullName, phone: receiver.phone },
      { upsert: true, session }
    );

    // Records Transfer
    await Transfer.create([{
      sender: sender._id,
      receiver: receiver._id,
      amount,
      fee,
      narration: narration || "Wallet Transfer",
      reference,
      status: "success",
    }], { session });

    // LAYER 5: DETAILED TRANSACTION LEDGERS
    const [senderTransaction] = await Transaction.create([{
      userId: sender._id,
      type: "transfer",
      amount: totalDebit,
      fee,
      idempotencyKey: req.purchaseIdempotency.key,
      requestFingerprint: req.purchaseIdempotency.fingerprint,
      description: `Transfer to ${receiver.fullName}`,
      status: "success",
      reference,
      recipient: { name: receiver.fullName, phone: receiver.phone }
    }], { session });

    await Transaction.create([{
      userId: receiver._id,
      type: "wallet_received",
      amount: amount,
      fee: 0,
      description: `Received money from ${sender.fullName}`,
      status: "success",
      reference,
    }], { session });

    await postFinancialJournal({
      idempotencyKey: `p2p-transfer:${reference}`,
      sourceType: "internal_wallet_transfer",
      sourceId: reference,
      sourceReference: reference,
      sourceTransactionId: senderTransaction._id,
      category: "customer_transfer",
      description: narration || "Internal customer wallet transfer.",
      occurredAt: new Date(),
      userId: sender._id,
      counterpartyUserId: receiver._id,
      session,
      lines: [
        { account: FINANCIAL_ACCOUNTS.customerWallet, debit: totalDebit, userId: sender._id },
        { account: FINANCIAL_ACCOUNTS.customerWallet, credit: amount, userId: receiver._id },
        ...(fee > 0
          ? [{ account: FINANCIAL_ACCOUNTS.transferFeeRevenue, credit: fee }]
          : []),
      ],
    });
    if (fee > 0) await addTransferFee(fee, session);

    // Commit ledger and wallet changes before emitting external side effects.
    await session.commitTransaction();
    session.endSession();

    try {
      emitWalletUpdate(sender._id, sender.walletBalance);
      emitWalletUpdate(receiver._id, receiver.walletBalance);
    } catch (error) {
      console.error("Transfer wallet update broadcast failed after commit:", error.code || error.name || "unclassified_error");
    }
    await recordFinancialAudit({
      user: senderId,
      operationType: "swiftvault_transfer_debit",
      amount: totalDebit,
      balanceBefore: senderBalanceBefore,
      balanceAfter: sender.walletBalance,
      source: "user_action",
      destination: receiver.phone,
      reference,
      reason: narration || "SwiftVault transfer",
      req,
    });
    await recordFinancialAudit({
      user: receiver._id,
      operationType: "swiftvault_transfer_credit",
      amount,
      balanceBefore: receiverBalanceBefore,
      balanceAfter: receiver.walletBalance,
      source: "user_action",
      destination: sender.phone,
      reference,
      reason: narration || "SwiftVault transfer received",
    });

    const notificationResults = await Promise.allSettled([
      sendNotification({
        userId: receiver._id,
        title: "Money Received",
        message: `You have received ₦${amount.toLocaleString()} from ${sender.fullName}.`,
        type: "wallet",
        icon: "💰",
        priority: "normal",
        actionUrl: "/transactions",
      }),
      sendNotification({
        userId: sender._id,
        title: "Transfer Successful",
        message: `₦${amount.toLocaleString()} sent to ${receiver.fullName}. Fee: ₦${fee}.`,
        type: "transfer",
        icon: "💸",
        priority: "normal",
        actionUrl: "/transactions",
      }),
    ]);
    for (const result of notificationResults) {
      if (result.status === "rejected") {
        console.error("Transfer notification failed after commit:", result.reason?.message || "unclassified_error");
      }
    }

    return res.json({
      success: true,
      message: "Transfer completed successfully",
      reference,
      senderBalance: sender.walletBalance,
    });

  } catch (err) {
    // Catch-all safety rollback block
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    return res.status(500).json({ message: err.message });
  }
};

// BENEFICIARY ENDPOINTS MANAGEMENT
export const getBeneficiaries = async (req, res) => {
  try {
    const list = await Beneficiary.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, beneficiaries: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteBeneficiary = async (req, res) => {
  try {
    await Beneficiary.deleteOne({ _id: req.params.id, userId: req.user.id });
    res.json({ success: true, message: "Beneficiary removed from your dashboard." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
