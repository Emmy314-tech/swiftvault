import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import FinancialAuditLog from "../models/FinancialAuditLog.js";
import { addUpgradeRevenue } from "../services/companyWalletService.js";
import { authenticateTransactionPin } from "../services/pinService.js";
import { getSettings } from "../services/settingsService.js";
import { FINANCIAL_ACCOUNTS, postFinancialJournal } from "../services/financialLedgerService.js";
import {
  activateUserUpgrade,
  getUpgradeAllocation,
  isEligibleUpgradeReferrer,
} from "../services/membershipService.js";

const isTransactionUnavailable = (error) =>
  error?.code === 20 ||
  error?.codeName === "IllegalOperation" ||
  /Transaction numbers are only allowed|replica set|mongos/i.test(error?.message || "");

export const purchaseUpgrade = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const upgradeFee = Number((await getSettings()).upgradeFee);
    const user = await User.findById(req.user.id).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found." });
    }
    if (user.role === "admin") {
      await session.abortTransaction();
      return res.status(403).json({ message: "Admin accounts cannot purchase user membership." });
    }
    if (user.isUpgraded) {
      await session.abortTransaction();
      return res.status(409).json({ message: "This account is already upgraded." });
    }

    const pinCheck = await authenticateTransactionPin(user, req.body.pin, session);
    if (!pinCheck.ok) {
      await session.commitTransaction();
      return res.status(pinCheck.status).json({ message: pinCheck.message });
    }

    const balanceBefore = user.walletBalance;
    if (balanceBefore < upgradeFee) {
      await session.abortTransaction();
      return res.status(400).json({ message: `Insufficient wallet balance for the ₦${upgradeFee.toLocaleString()} upgrade.` });
    }

    const referrer = user.referredBy
      ? await User.findOne({ referralCode: user.referredBy }).session(session)
      : null;
    const hasEligibleReferrer = isEligibleUpgradeReferrer(referrer);
    const allocation = getUpgradeAllocation(hasEligibleReferrer, upgradeFee);
    const reference = `UPG-${crypto.randomUUID()}`;

    user.walletBalance -= upgradeFee;
    activateUserUpgrade(user);
    await user.save({ session });

    const [payment] = await Transaction.create([{
      userId: user._id,
      type: "upgrade",
      amount: upgradeFee,
      balanceBefore,
      idempotencyKey: req.purchaseIdempotency.key,
      requestFingerprint: req.purchaseIdempotency.fingerprint,
      description: "Paid account upgrade",
      status: "success",
      reference,
      upgradeAllocation: {
        company: allocation.company,
        referrer: allocation.referrer,
        referrerUserId: hasEligibleReferrer ? referrer._id : null,
      },
    }], { session });

    const companyWallet = await addUpgradeRevenue(allocation.company, session);
    await postFinancialJournal({
      idempotencyKey: `membership-upgrade:${payment._id}`,
      sourceType: "membership_upgrade",
      sourceId: payment._id,
      sourceReference: reference,
      sourceTransactionId: payment._id,
      category: "membership_revenue",
      description: "Confirmed membership upgrade paid from customer wallet.",
      occurredAt: payment.createdAt || new Date(),
      userId: user._id,
      session,
      lines: [
        { account: FINANCIAL_ACCOUNTS.customerWallet, debit: upgradeFee, userId: user._id },
        { account: FINANCIAL_ACCOUNTS.membershipRevenue, credit: upgradeFee },
      ],
    });
    const auditEntries = [{
      user: user._id,
      operationType: "upgrade",
      amount: upgradeFee,
      balanceBefore,
      balanceAfter: user.walletBalance,
      source: "user_action",
      reference,
      reason: "Paid account upgrade; tier unchanged.",
    }, {
      user: user._id,
      operationType: "upgrade_company_allocation",
      amount: allocation.company,
      balanceBefore: companyWallet.balance - allocation.company,
      balanceAfter: companyWallet.balance,
      source: "system",
      destination: "company_wallet",
      reference,
      reason: "Company allocation from confirmed upgrade payment.",
    }];

    if (hasEligibleReferrer) {
      const referrerBalanceBefore = referrer.walletBalance;
      referrer.walletBalance += allocation.referrer;
      await referrer.save({ session });

      await Transaction.create([{
        userId: referrer._id,
        type: "referral_upgrade_bonus",
        amount: allocation.referrer,
        balanceBefore: referrerBalanceBefore,
        idempotencyKey: `referral-bonus:${payment._id}`,
        description: `Eligible referral commission from ${user.username}'s upgrade`,
        status: "success",
        reference: `UPG-REF-${payment._id}`,
      }], { session });
      await postFinancialJournal({
        idempotencyKey: `referral-bonus:${payment._id}`,
        sourceType: "membership_referral_bonus",
        sourceId: payment._id,
        sourceReference: reference,
        sourceTransactionId: payment._id,
        category: "referral_bonus",
        description: "Referral bonus credited to the referrer's customer wallet.",
        occurredAt: payment.createdAt || new Date(),
        userId: referrer._id,
        counterpartyUserId: user._id,
        session,
        lines: [
          { account: FINANCIAL_ACCOUNTS.referralExpense, debit: allocation.referrer },
          { account: FINANCIAL_ACCOUNTS.customerWallet, credit: allocation.referrer, userId: referrer._id },
        ],
      });

      auditEntries.push({
        user: referrer._id,
        operationType: "referral_commission",
        amount: allocation.referrer,
        balanceBefore: referrerBalanceBefore,
        balanceAfter: referrer.walletBalance,
        source: "system",
        destination: user.username,
        reference,
        reason: "Commission paid because the referrer was upgraded at payment confirmation.",
      });
    }

    await FinancialAuditLog.create(
      auditEntries.map((entry) => ({ ...entry, ipAddress: req.ip || "Unknown" })),
      { session }
    );
    await session.commitTransaction();

    return res.json({
      success: true,
      message: "Account upgraded successfully.",
      tier: user.tier,
      isUpgraded: user.isUpgraded,
      walletBalance: user.walletBalance,
      reference,
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error("Upgrade purchase failed:", error.code || error.name || "unclassified_error");
    if (error?.code === 11000 || error?.code === 112) {
      return res.status(409).json({ message: "This upgrade request was already processed or is being processed. Check your transaction history before retrying." });
    }
    if (isTransactionUnavailable(error)) {
      return res.status(503).json({ message: "Upgrade purchases require MongoDB replica-set transaction support. No upgrade was applied." });
    }
    return res.status(500).json({ message: "Upgrade could not be completed. No upgrade was applied." });
  } finally {
    await session.endSession();
  }
};

export const getUpgradeFee = async (req, res) => {
  try {
    const fee = Number((await getSettings()).upgradeFee);
    getUpgradeAllocation(false, fee);
    return res.json({ upgradeFee: fee });
  } catch (error) {
    return res.status(500).json({ message: "Upgrade fee configuration is unavailable." });
  }
};
