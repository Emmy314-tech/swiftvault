import mongoose from "mongoose";
import crypto from "crypto";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import CompanyWallet from "../models/CompanyWallet.js";
import Notification from "../models/Notification.js";
import AdminActivityLog from "../models/AdminActivityLog.js";
import FinancialAuditLog from "../models/FinancialAuditLog.js";
import WebhookLog from "../models/WebhookLog.js";
import ReconciliationAttempt from "../models/ReconciliationAttempt.js";
import { logAdminActivity } from "../services/adminActivityService.js";
import { recordFinancialAudit } from "../services/financialAuditService.js";
import { isSafeReconciliationNote, resolveTransactionProvider } from "../services/reconciliationProvider.js";
import { recordPendingReconciliationAttempt, settlePendingTransaction } from "../services/transactionReconciliation.js";
import { changeUserTier } from "../services/membershipService.js";
import { FINANCIAL_ACCOUNTS, postFinancialJournal } from "../services/financialLedgerService.js";
import { listAdminKycProfiles, reviewTierThree } from "./kycController.js";

export { listAdminKycProfiles, reviewTierThree };

// DASHBOARD: Income & Volume Overview
export const getAdminDashboard = async (req, res) => {
  try {
    const stats = await Transaction.aggregate([
      { $match: { status: "success", type: { $ne: "wallet_received" } } },
      { $group: { _id: null, totalVolume: { $sum: "$amount" }, count: { $sum: 1 } } }
    ]);
    const totalUsers = await User.countDocuments();
    res.json({
      totalUsers,
      totalVolume: stats[0]?.totalVolume || 0,
      totalTransactions: stats[0]?.count || 0
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// COMPANY WALLET SUMMARY - new endpoint, nothing previously exposed this data
export const getCompanyWalletSummary = async (req, res) => {
  try {
    let wallet = await CompanyWallet.findOne();
    if (!wallet) wallet = await CompanyWallet.create({});
    res.json(wallet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// USER STATISTICS - new endpoint, breaks down user counts by tier/status
export const getUserStatistics = async (req, res) => {
  try {
    const [totalUsers, normalUsers, retailUsers, wholesaleUsers, upgradedUsers, verifiedUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ tier: "normal", role: { $ne: "admin" } }),
      User.countDocuments({ tier: "retail", role: { $ne: "admin" } }),
      User.countDocuments({ tier: "wholesale", role: { $ne: "admin" } }),
      User.countDocuments({ isUpgraded: true, role: { $ne: "admin" } }),
      User.countDocuments({ phoneVerified: true }),
    ]);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newUsersLast30Days = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

    res.json({ totalUsers, normalUsers, retailUsers, wholesaleUsers, upgradedUsers, verifiedUsers, newUsersLast30Days });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// TRANSACTION STATISTICS with daily revenue series for charts - new endpoint
export const getTransactionStatistics = async (req, res) => {
  try {
    const [byStatus, byType, dailyRevenue, vtuFinancialRows] = await Promise.all([
      Transaction.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$amount" } } }]),
      Transaction.aggregate([{ $match: { status: "success" } }, { $group: { _id: "$type", count: { $sum: 1 }, total: { $sum: "$amount" } } }]),
      Transaction.aggregate([
        { $match: { status: "success", createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, total: { $sum: "$amount" } } },
        { $sort: { _id: 1 } },
      ]),
      Transaction.aggregate([
        { $match: { type: { $in: ["airtime", "data_purchase", "cable_tv", "electricity", "epin", "exam_pin"] }, status: { $in: ["success", "failed"] } } },
        {
          $group: {
            _id: null,
            grossRevenue: {
              $sum: {
                $cond: [
                  { $and: [
                    { $eq: ["$status", "success"] },
                    { $isNumber: "$pricingSnapshot.reconciledProviderCost" },
                    { $isNumber: "$pricingSnapshot.reconciledProviderFee" },
                  ] },
                  "$amount",
                  0,
                ],
              },
            },
            unverifiedChargeSales: {
              $sum: {
                $cond: [
                  { $and: [
                    { $eq: ["$status", "success"] },
                    { $not: [{ $and: [
                      { $isNumber: "$pricingSnapshot.reconciledProviderCost" },
                      { $isNumber: "$pricingSnapshot.reconciledProviderFee" },
                    ] }] },
                  ] },
                  "$amount",
                  0,
                ],
              },
            },
            providerCosts: {
              $sum: {
                $cond: [
                  { $and: [
                    { $eq: ["$status", "success"] },
                    { $isNumber: "$pricingSnapshot.reconciledProviderCost" },
                    { $isNumber: "$pricingSnapshot.reconciledProviderFee" },
                  ] },
                  "$pricingSnapshot.reconciledProviderCost",
                  0,
                ],
              },
            },
            providerFees: {
              $sum: {
                $cond: [
                  { $and: [
                    { $eq: ["$status", "success"] },
                    { $isNumber: "$pricingSnapshot.reconciledProviderCost" },
                    { $isNumber: "$pricingSnapshot.reconciledProviderFee" },
                  ] },
                  "$pricingSnapshot.reconciledProviderFee",
                  0,
                ],
              },
            },
            transactionFees: {
              $sum: {
                $cond: [
                  { $and: [
                    { $eq: ["$status", "success"] },
                    { $isNumber: "$pricingSnapshot.reconciledProviderCost" },
                    { $isNumber: "$pricingSnapshot.reconciledProviderFee" },
                  ] },
                  { $ifNull: ["$fee", 0] },
                  0,
                ],
              },
            },
            refunds: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, "$amount", 0] } },
          },
        },
      ]),
    ]);

    const vtu = vtuFinancialRows[0] || {
      grossRevenue: 0,
      providerCosts: 0,
      providerFees: 0,
      transactionFees: 0,
      unverifiedChargeSales: 0,
      refunds: 0,
    };
    vtu.grossProfit = vtu.grossRevenue - vtu.providerCosts - vtu.providerFees - vtu.transactionFees;
    vtu.netResult = vtu.grossProfit;
    vtu.netResultFormula = "Verified-cost VTU sales minus reconciled provider costs, provider fees, and transaction fees. Sales with unknown provider charges are excluded and reported separately.";
    res.json({ byStatus, byType, dailyRevenue, vtuFinancials: vtu });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


export const listUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password -pin -adminPin -phoneOTP -phoneOTPExpires")
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// SUSPEND/REACTIVATE - new endpoint, User model didn't have any status field at all
export const toggleSuspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isSuspended = !user.isSuspended;
    await user.save();

    await logAdminActivity({
      admin: req.user,
      action: user.isSuspended ? "user_suspended" : "user_activated",
      description: `${user.isSuspended ? "Suspended" : "Reactivated"} user ${user.fullName} (@${user.username})`,
      req,
    });

    res.json({ success: true, isSuspended: user.isSuspended });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getUserDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password -pin -adminPin -phoneOTP -phoneOTPExpires");
    if (!user) return res.status(404).json({ message: "User not found" });
    const transactions = await Transaction.find({ userId: user._id }).select("-provider_response -idempotencyKey -requestFingerprint -balanceBefore").sort({ createdAt: -1 }).limit(20);
    res.json({ user, transactions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateUserTier = async (req, res) => {
  try {
    const { tier } = req.body;
    if (!["normal", "retail", "wholesale"].includes(tier)) {
      return res.status(400).json({ message: "Choose a valid tier: normal, retail, or wholesale." });
    }
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.role === "admin") return res.status(400).json({ message: "Admin accounts do not have a customer tier." });
    if (user.tier === tier) return res.json({ success: true, tier: user.tier, changed: false });

    const previousTier = user.tier;
    changeUserTier(user, tier);
    await user.save();
    await logAdminActivity({
      admin: req.user,
      action: "user_tier_changed",
      description: `Changed ${user.username}'s tier from ${previousTier} to ${tier}; upgrade status unchanged.`,
      req,
    });
    return res.json({ success: true, tier: user.tier, isUpgraded: user.isUpgraded === true });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const updateUserUpgradeStatus = async (req, res) => {
  try {
    const { isUpgraded } = req.body;
    if (typeof isUpgraded !== "boolean") {
      return res.status(400).json({ message: "isUpgraded must be a boolean." });
    }
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.role === "admin") return res.status(400).json({ message: "Admin accounts do not have customer upgrade status." });
    if (user.isUpgraded === isUpgraded) {
      return res.json({ success: true, isUpgraded: user.isUpgraded, changed: false });
    }

    user.isUpgraded = isUpgraded;
    user.upgradedAt = isUpgraded ? new Date() : null;
    await user.save();
    await logAdminActivity({
      admin: req.user,
      action: isUpgraded ? "user_upgrade_granted" : "user_upgrade_revoked",
      description: `Admin ${isUpgraded ? "granted" : "revoked"} upgrade status for ${user.username}; tier unchanged.`,
      req,
    });
    return res.json({ success: true, isUpgraded: user.isUpgraded, tier: user.tier });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const adjustUserBalance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, amount, type, reason } = req.body;

    // Strict validation - a NaN/negative amount here would permanently corrupt
    // the user's walletBalance, and a debit that pushes the balance negative
    // would create money out of thin air on the next credit.
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "Amount must be a positive number" });
    }
    if (!["credit", "debit"].includes(type)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "type must be 'credit' or 'debit'" });
    }
    if (!reason || !String(reason).trim()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "A reason is required for every adjustment" });
    }
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "Valid userId is required" });
    }

    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    const newBalance = type === "credit" ? user.walletBalance + numericAmount : user.walletBalance - numericAmount;
    if (newBalance < 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "Debit would make the wallet balance negative" });
    }

    const balanceBefore = user.walletBalance;
    user.walletBalance = newBalance;
    await user.save({ session });

    const adjustmentReference = crypto.randomUUID();
    const [adjustmentTransaction] = await Transaction.create([{
      userId, type: "admin_adjustment", amount: numericAmount,
      description: `Admin Action: ${reason}`, status: "success", reference: adjustmentReference
    }], { session });
    await postFinancialJournal({
      idempotencyKey: `admin-wallet-adjustment:${adjustmentReference}`,
      sourceType: "admin_wallet_adjustment",
      sourceId: adjustmentReference,
      sourceReference: adjustmentReference,
      sourceTransactionId: adjustmentTransaction._id,
      category: "admin_adjustment",
      description: `Admin wallet adjustment: ${String(reason).trim().slice(0, 300)}`,
      occurredAt: new Date(),
      userId: user._id,
      adminId: req.user._id,
      session,
      lines: type === "credit"
        ? [
            { account: FINANCIAL_ACCOUNTS.manualAdjustment, debit: numericAmount },
            { account: FINANCIAL_ACCOUNTS.customerWallet, credit: numericAmount, userId: user._id },
          ]
        : [
            { account: FINANCIAL_ACCOUNTS.customerWallet, debit: numericAmount, userId: user._id },
            { account: FINANCIAL_ACCOUNTS.manualAdjustment, credit: numericAmount },
          ],
    });

    await session.commitTransaction();

    await recordFinancialAudit({
      user: user._id,
      admin: req.user._id,
      operationType: "admin_wallet_adjustment",
      amount: numericAmount,
      balanceBefore,
      balanceAfter: user.walletBalance,
      source: "admin_action",
      reference: adjustmentReference,
      reason,
      req,
    });

    await logAdminActivity({
      admin: req.user,
      action: "wallet_adjusted",
      description: `${type === "credit" ? "Credited" : "Debited"} ₦${numericAmount} to ${user.fullName} (@${user.username}) - Reason: ${reason}`,
      req,
    });

    res.json({ success: true, newBalance: user.walletBalance });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ error: err.message });
  } finally { session.endSession(); }
};

// TRANSACTION MANAGEMENT
// Extended with optional pagination/filters - if no query params are sent, behaves
// exactly as before (most recent, capped list) so nothing existing breaks.
export const getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, type, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (search) filter.$or = [{ description: new RegExp(search, "i") }, { reference: new RegExp(search, "i") }];

    const txs = await Transaction.find(filter)
      .select("-provider_response -idempotencyKey -requestFingerprint -balanceBefore")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await Transaction.countDocuments(filter);

    res.json({ transactions: txs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const resolveTransaction = async (req, res) => {
  return res.status(409).json({
    message: "Provider-backed transactions must be settled from a verified provider result. Manual status changes are disabled.",
  });
};

export const listPendingReconciliation = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const filter = {
      status: "pending",
      type: { $in: ["transfer", "company_withdrawal", "airtime", "data_purchase", "cable_tv", "electricity", "epin", "exam_pin"] },
    };
    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .select("type reference amount fee providerCost providerFee pricingSnapshot status createdAt")
        .sort({ createdAt: 1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit),
      Transaction.countDocuments(filter),
    ]);

    res.json({
      transactions: transactions.map((transaction) => ({
        ...transaction.toObject(),
        provider: resolveTransactionProvider(transaction.type),
      })),
      total,
      page: numericPage,
      totalPages: Math.ceil(total / numericLimit),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const reconcileTransaction = async (req, res) => {
  const { transactionId } = req.params;
  let transaction = null;
  let provider = null;
  if (!mongoose.Types.ObjectId.isValid(transactionId)) {
    return res.status(400).json({ message: "Valid transaction ID is required." });
  }

  try {
    transaction = await Transaction.findById(transactionId).select("type reference amount fee providerCost providerFee pricingSnapshot status createdAt");
    if (!transaction) return res.status(404).json({ message: "Transaction not found." });
    if (transaction.status !== "pending") return res.status(409).json({ message: "Only pending transactions can be reconciled." });

    provider = resolveTransactionProvider(transaction.type);
    if (provider !== "peyflex") return res.status(400).json({ message: "This transaction type has no reconciliation provider." });

    const { status, evidenceReference, reason, providerCost, providerFee } = req.body;
    if (!["success", "failed"].includes(status) || !isSafeReconciliationNote(evidenceReference, reason)) {
      return res.status(400).json({ message: "Choose an outcome and provide a short evidence reference and note without credentials or raw provider data." });
    }
    if (["epin", "exam_pin"].includes(transaction.type) && status === "success") {
      return res.status(409).json({ message: "Successful ePIN/exam PIN reconciliation requires recovering and securely delivering the provider-issued code first." });
    }

    const parsedProviderCost = providerCost === undefined || providerCost === "" ? undefined : Number(providerCost);
    const parsedProviderFee = providerFee === undefined || providerFee === "" ? undefined : Number(providerFee);
    if (status === "success" &&
      (!Number.isFinite(parsedProviderCost) || parsedProviderCost < 0 ||
        !Number.isFinite(parsedProviderFee) || parsedProviderFee < 0)) {
      return res.status(400).json({ message: "Confirmed provider cost and fee are required to settle a successful purchase." });
    }
    if (parsedProviderCost !== undefined &&
      (!Number.isFinite(parsedProviderCost) || parsedProviderCost < 0)) {
      return res.status(400).json({ message: "Provider cost must be a finite non-negative amount." });
    }
    if (parsedProviderFee !== undefined &&
      (!Number.isFinite(parsedProviderFee) || parsedProviderFee < 0)) {
      return res.status(400).json({ message: "Provider fee must be a finite non-negative amount." });
    }

    const settled = await settlePendingTransaction({
      transactionId,
      provider,
      finalStatus: status,
      observedStatus: "MANUAL_PROVIDER_PORTAL",
      actor: req.user,
      mode: "manual",
      reason: `${String(evidenceReference).slice(0, 200)}: ${String(reason).slice(0, 700)}`,
      providerCost: parsedProviderCost,
      providerFee: parsedProviderFee,
      req,
    });
    await logAdminActivity({ admin: req.user, action: "transaction_reconciled", description: `Manual Peyflex reconciliation for ${transaction.reference}: ${settled.result}.`, req });
    return res.json({ status: settled.transaction?.status || settled.result, reference: transaction.reference });
  } catch (err) {
    if (transaction && provider) {
      await recordPendingReconciliationAttempt({
        transaction,
        provider,
        actor: req.user,
        mode: "manual",
        result: "error",
        reason: "Reconciliation could not be committed; transaction state was not assumed.",
        req,
      }).catch(() => {});
    }
    return res.status(500).json({ message: "Reconciliation could not be completed. No outcome should be assumed." });
  }
};

export const getReconciliationAttempts = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.transactionId)) {
      return res.status(400).json({ message: "Valid transaction ID is required." });
    }
    const attempts = await ReconciliationAttempt.find({ transactionId: req.params.transactionId })
      .select("provider mode requestedOutcome observedStatus result reason createdAt actor")
      .populate("actor", "fullName username")
      .sort({ createdAt: -1 })
      .limit(50);
    return res.json({ attempts });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// WEBHOOK LOGS - read-only view of every incoming webhook, regardless of outcome
export const getWebhookLogs = async (req, res) => {
  try {
    const { page = 1, limit = 30, processingStatus, search } = req.query;
    const filter = {};
    if (processingStatus) filter.processingStatus = processingStatus;
    if (search) filter.reference = new RegExp(search, "i");

    const logs = await WebhookLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await WebhookLog.countDocuments(filter);

    res.json({ logs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// FINANCIAL AUDIT TRAIL - read-only, immutable. No update/delete route exists
// anywhere for this collection, by design.
export const getFinancialAuditLog = async (req, res) => {
  try {
    const { page = 1, limit = 30, operationType, userId, search } = req.query;
    const filter = {};
    if (operationType) filter.operationType = operationType;
    if (userId) filter.user = userId;
    if (search) filter.$or = [{ reference: new RegExp(search, "i") }, { reason: new RegExp(search, "i") }];

    const logs = await FinancialAuditLog.find(filter)
      .populate("user", "fullName username")
      .populate("admin", "fullName username")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await FinancialAuditLog.countDocuments(filter);

    res.json({ logs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ADMIN ACTIVITY LOG - new endpoint
export const getAdminActivityLog = async (req, res) => {
  try {
    const { page = 1, limit = 30, action, adminId, search } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (adminId) filter.adminId = adminId;
    if (search) filter.$or = [{ description: new RegExp(search, "i") }, { adminName: new RegExp(search, "i") }];

    const logs = await AdminActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await AdminActivityLog.countDocuments(filter);

    res.json({ logs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// NOTIFICATIONS (admin-initiated) - new functionality, nothing previously let an
// admin push a notification to users; only user-facing read/delete existed.
export const broadcastNotification = async (req, res) => {
  try {
    const { title, message, type = "system" } = req.body;
    if (!title || !message) return res.status(400).json({ message: "title and message are required" });

    const userIds = await User.find().distinct("_id");
    const docs = userIds.map((userId) => ({ userId, title, message, type }));
    await Notification.insertMany(docs);

    await logAdminActivity({
      admin: req.user,
      action: "notification_broadcast",
      description: `Broadcast "${title}" to ${docs.length} users`,
      req,
    });

    res.json({ success: true, message: `Notification sent to ${docs.length} users` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const sendIndividualNotification = async (req, res) => {
  try {
    const { userId, title, message, type = "system" } = req.body;
    if (!userId || !title || !message) return res.status(400).json({ message: "userId, title, and message are required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    await Notification.create({ userId, title, message, type });

    await logAdminActivity({
      admin: req.user,
      action: "notification_sent",
      description: `Sent "${title}" to ${user.fullName} (@${user.username})`,
      req,
    });

    res.json({ success: true, message: "Notification sent" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
