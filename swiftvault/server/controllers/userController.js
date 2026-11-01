import User from "../models/User.js";
import crypto from "crypto";
import mongoose from "mongoose";
import Settings from "../models/Settings.js";
import Transaction from "../models/Transaction.js";
import PromotionalReserve from "../models/PromotionalReserve.js";
import { getSettings } from "../services/settingsService.js";
import { FINANCIAL_ACCOUNTS, postFinancialJournal } from "../services/financialLedgerService.js";
import { normalizePhone } from "../utils/normalizePhone.js";

/**
 * @route   GET /api/user/wallet
 * @desc    Fetch authenticated user's ledger balances
 */
export const getWallet = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User account not found" });

    res.json({
      walletBalance: user.walletBalance || 0,
      bonusBalance: user.bonusBalance || 0,
      totalBalance: (user.walletBalance || 0) + (user.bonusBalance || 0)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @route   GET /api/user/dashboard
 * @desc    Fetch synchronized homepage financial parameters
 */
export const getDashboard = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User account not found" });
    const referredUsers = user.referralCode
      ? await User.find({ referredBy: user.referralCode })
        .select("fullName username createdAt")
        .sort({ createdAt: -1 })
        .lean()
      : [];
    const paidUpgrades = referredUsers.length
      ? await Transaction.find({
        userId: { $in: referredUsers.map((referredUser) => referredUser._id) },
        type: "upgrade",
        status: "success",
      }).select("userId createdAt").sort({ createdAt: 1 }).lean()
      : [];
    const firstPaidUpgradeByUser = new Map();
    for (const upgrade of paidUpgrades) {
      const key = String(upgrade.userId);
      if (!firstPaidUpgradeByUser.has(key)) firstPaidUpgradeByUser.set(key, upgrade.createdAt);
    }
    const referralsWithConversion = referredUsers.map((referredUser) => ({
      ...referredUser,
      convertedAt: firstPaidUpgradeByUser.get(String(referredUser._id)) || null,
    }));

    res.json({
      user: {
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        accountNumber: user.phone, // Phone number is the account number!
        role: user.role,
        tier: user.tier || "normal",
        isUpgraded: user.isUpgraded === true,
        businessName: user.businessName || null
      },
      wallet: {
        walletBalance: user.walletBalance || 0,
        bonusBalance: user.bonusBalance || 0,
        totalBalance: (user.walletBalance || 0) + (user.bonusBalance || 0)
      },
      referrals: {
        code: user.referralCode,
        referredBy: user.referredBy || null,
        users: referralsWithConversion,
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @route   GET /api/user/profile
 * @desc    Fetch comprehensive profile details
 */
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User account not found" });
    const settings = await getSettings();
    const campaignStart = settings?.welcomeBonusEnabledAt;

    res.json({
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      phone: user.phone,
      accountNumber: user.phone, // Transparently exposed as account identifier
      role: user.role,
      tier: user.tier || "normal",
      isUpgraded: user.isUpgraded === true,
      businessName: user.businessName || null,
      referralCode: user.referralCode,
      walletBalance: user.walletBalance || 0,
      bonusBalance: user.bonusBalance || 0,
      totalBalance: (user.walletBalance || 0) + (user.bonusBalance || 0),
      hasTransactionPin: Boolean(user.pin),
      hasAdminPin: user.role === "admin" && Boolean(user.adminPin),
      welcomeBonusEligible: settings?.welcomeBonusEnabled === true &&
        campaignStart instanceof Date &&
        user.createdAt >= campaignStart &&
        user.phoneVerified === true &&
        !user.welcomeBonusAwardedAt,
      welcomeBonusAmount: Number(settings?.welcomeBonus || 0),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const claimWelcomeBonus = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const user = await User.findById(req.user.id).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User account not found." });
    }

    const settings = await Settings.findOne().session(session);
    const amount = Number(settings?.welcomeBonus);
    const amountCents = Math.round(amount * 100);
    if (settings?.welcomeBonusEnabled !== true ||
      !(settings.welcomeBonusEnabledAt instanceof Date) ||
      !(user.createdAt instanceof Date) ||
      user.createdAt < settings.welcomeBonusEnabledAt ||
      user.phoneVerified !== true ||
      !Number.isSafeInteger(amountCents) || amountCents <= 0 ||
      Math.abs(amountCents / 100 - amount) > 0.000001) {
      await session.abortTransaction();
      return res.status(409).json({ message: "You are not eligible for the welcome bonus." });
    }
    if (user.welcomeBonusAwardedAt) {
      await session.abortTransaction();
      return res.status(409).json({ message: "The welcome bonus has already been claimed." });
    }

    const existingAward = await Transaction.findOne({
      userId: user._id,
      type: "welcome_bonus",
    }).session(session);
    if (existingAward) {
      await session.abortTransaction();
      return res.status(409).json({ message: "The welcome bonus has already been claimed." });
    }

    const reserve = await PromotionalReserve.findOneAndUpdate(
      { key: "primary", availableBalance: { $gte: amountCents / 100 } },
      { $inc: { availableBalance: -(amountCents / 100), awardedTotal: amountCents / 100 } },
      { new: true, session },
    );
    if (!reserve) {
      await session.abortTransaction();
      return res.status(409).json({ message: "The welcome bonus reserve is unavailable." });
    }

    const reference = crypto.randomUUID();
    const awardIdempotencyKey = `welcome-bonus:${user._id}`;
    const transactionId = new mongoose.Types.ObjectId();
    user.bonusBalance = Number(user.bonusBalance || 0) + amountCents / 100;
    user.welcomeBonusAwardedAt = new Date();
    await user.save({ session });
    await Transaction.create([{
      _id: transactionId,
      userId: user._id,
      type: "welcome_bonus",
      amount: amountCents / 100,
      status: "success",
      reference,
      idempotencyKey: awardIdempotencyKey,
      description: "One-time promotional welcome bonus.",
      balanceBefore: user.walletBalance || 0,
      walletAllocation: { wallet: 0, bonus: amountCents / 100 },
    }], { session });
    await postFinancialJournal({
      idempotencyKey: awardIdempotencyKey,
      sourceType: "welcome_bonus",
      sourceId: String(user._id),
      sourceReference: reference,
      sourceTransactionId: transactionId,
      category: "welcome_bonus",
      description: "One-time promotional welcome bonus credited to the customer bonus wallet.",
      userId: user._id,
      session,
      lines: [
        { account: FINANCIAL_ACCOUNTS.promotionalReserve, debit: amountCents / 100 },
        { account: FINANCIAL_ACCOUNTS.customerBonusWallet, credit: amountCents / 100, userId: user._id },
      ],
    });

    await session.commitTransaction();
    return res.status(201).json({
      success: true,
      amount: amountCents / 100,
      bonusBalance: user.bonusBalance,
      reference,
    });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    if (err.code === 11000) {
      return res.status(409).json({ message: "The welcome bonus has already been claimed." });
    }
    console.error("Welcome bonus claim failed:", err.code || err.name || "unclassified_error");
    return res.status(500).json({ message: "The welcome bonus could not be claimed." });
  } finally {
    await session.endSession();
  }
};

/**
 * @route   PUT /api/user/update
 * @desc    Update profile details (phone changes are rejected - contact support)
 */
export const updateProfile = async (req, res) => {
  try {
    const { fullName, email, phone, businessName } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User account not found" });

    const updateFields = {};

    if (fullName !== undefined) updateFields.fullName = fullName;
    if (email !== undefined) updateFields.email = email;
    if (businessName !== undefined) updateFields.businessName = businessName;

    // 🔒 PHONE NUMBER CHANGES ARE NOT SELF-SERVE (mirrors the Edit Profile screen,
    // which tells users to contact support). The old implementation flipped
    // phoneVerified to false and asked the user to verify a code that was only
    // ever written to the server log - permanently locking accounts out of login.
    // Rejecting here keeps server behavior honest and aligned with the UI.
    if (phone !== undefined) {
      const normalized = normalizePhone(phone);
      if (normalized !== user.phone) {
        return res.status(400).json({
          message: "Phone number changes aren't self-serve yet. Please contact support to update your account number.",
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select("-password");

    res.json({
      success: true,
      message: "SwiftVault security parameters and profile updated successfully!",
      user: {
        fullName: updatedUser.fullName,
        username: updatedUser.username,
        email: updatedUser.email,
        phone: updatedUser.phone,
        accountNumber: updatedUser.phone,
        role: updatedUser.role,
        tier: updatedUser.tier || "normal",
        isUpgraded: updatedUser.isUpgraded === true,
        businessName: updatedUser.businessName || null
      }
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "This email address is already tied to another account." });
    }
    res.status(500).json({ message: err.message });
  }
};
