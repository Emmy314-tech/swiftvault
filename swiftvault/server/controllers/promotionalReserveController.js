import mongoose from "mongoose";
import AdminActivityLog from "../models/AdminActivityLog.js";
import FinancialJournal from "../models/FinancialJournal.js";
import PromotionalReserve from "../models/PromotionalReserve.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import { getSettings, updateSettings } from "../services/settingsService.js";
import { logAdminActivity } from "../services/adminActivityService.js";
import { FINANCIAL_ACCOUNTS, postFinancialJournal } from "../services/financialLedgerService.js";

const isPositiveMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 &&
    Number.isSafeInteger(Math.round(amount * 100)) &&
    Math.abs(Math.round(amount * 100) / 100 - amount) < 0.000001;
};

const getAccountBalance = async (account, session) => {
  const aggregation = FinancialJournal.aggregate([
    { $unwind: "$lines" },
    { $match: { "lines.account": account } },
    {
      $group: {
        _id: null,
        balance: { $sum: { $subtract: ["$lines.debit", "$lines.credit"] } },
      },
    },
  ]);
  if (session) aggregation.session(session);
  const [result] = await aggregation;
  return Number(result?.balance || 0);
};

const getPromotionalReserveBalances = async () => {
  const [reserve, awards, reserveRows, bonusRows, userBonusRows] = await Promise.all([
    PromotionalReserve.findOne({ key: "primary" }).lean(),
    Transaction.aggregate([
      { $match: { type: "welcome_bonus", status: "success" } },
      { $group: { _id: null, awardedTotal: { $sum: "$amount" }, awardCount: { $sum: 1 } } },
    ]),
    FinancialJournal.aggregate([
      { $unwind: "$lines" },
      { $match: { "lines.account": FINANCIAL_ACCOUNTS.promotionalReserve } },
      { $group: { _id: null, balance: { $sum: { $subtract: ["$lines.debit", "$lines.credit"] } } } },
    ]),
    FinancialJournal.aggregate([
      { $unwind: "$lines" },
      { $match: { "lines.account": FINANCIAL_ACCOUNTS.customerBonusWallet } },
      { $group: { _id: null, balance: { $sum: { $subtract: ["$lines.credit", "$lines.debit"] } } } },
    ]),
    User.aggregate([
      { $group: { _id: null, balance: { $sum: "$bonusBalance" } } },
    ]),
  ]);
  const fundedBalance = Number(reserve?.fundedBalance || 0);
  const availableBalance = Number(reserve?.availableBalance || 0);
  const recordedAwardedTotal = Number(reserve?.awardedTotal || 0);
  const awardedTotal = Number(awards[0]?.awardedTotal || 0);
  const expectedAvailableBalance = fundedBalance - awardedTotal;
  const reserveLedgerBalance = Number(reserveRows[0]?.balance || 0);
  const bonusLiability = Number(bonusRows[0]?.balance || 0);
  const userBonusBalance = Number(userBonusRows[0]?.balance || 0);
  return {
    fundedBalance,
    availableBalance,
    awardedTotal,
    awardCount: Number(awards[0]?.awardCount || 0),
    recordedAwardedTotal,
    reserveLedgerBalance,
    bonusLiability,
    userBonusBalance,
    expectedAvailableBalance,
    reconciled: Math.abs(expectedAvailableBalance - reserveLedgerBalance) < 0.01 &&
      Math.abs(availableBalance - expectedAvailableBalance) < 0.01 &&
      Math.abs(recordedAwardedTotal - awardedTotal) < 0.01 &&
      Math.abs(bonusLiability - userBonusBalance) < 0.01,
  };
};

export const getPromotionalReserve = async (_req, res) => {
  try {
    const [balances, settings, fundingEntries, companyBankBalance] = await Promise.all([
      getPromotionalReserveBalances(),
      getSettings(),
      FinancialJournal.find({ sourceType: "promotional_reserve_funding" })
        .select("sourceReference evidenceReference occurredAt lines adminId")
        .sort({ occurredAt: -1 })
        .limit(25)
        .lean(),
      getAccountBalance(FINANCIAL_ACCOUNTS.companyBank),
    ]);
    return res.json({
      success: true,
      enabled: settings.welcomeBonusEnabled === true,
      bonusAmount: Number(settings.welcomeBonus),
      balances,
      companyBankBalance,
      externalStatementReconciliation: "NOT_CONFIGURED",
      fundingEntries: fundingEntries.map((entry) => ({
        reference: entry.sourceReference,
        evidenceReference: entry.evidenceReference,
        occurredAt: entry.occurredAt,
        amount: Number(entry.lines.find((line) => line.account === FINANCIAL_ACCOUNTS.promotionalReserve)?.debit || 0),
      })),
    });
  } catch (error) {
    console.error("Promotional reserve status failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Promotional reserve status is unavailable." });
  }
};

export const fundPromotionalReserve = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const amount = Number(req.body.amount);
    const reference = String(req.body.reference || "").trim();
    const evidenceReference = String(req.body.evidenceReference || "").trim();
    if (!isPositiveMoney(amount) || !reference || reference.length > 120 ||
      !evidenceReference || evidenceReference.length > 200) {
      return res.status(400).json({
        message: "Provide a positive amount, unique funding reference, and bank-statement evidence reference.",
      });
    }

    session.startTransaction();
    const journalData = {
      idempotencyKey: `promotional-reserve-funding:${reference}`,
      sourceType: "promotional_reserve_funding",
      sourceId: reference,
      sourceReference: reference,
      category: "promotional_reserve_funding",
      description: "Company bank funds allocated to the promotional reserve.",
      sourceStatus: "paid",
      evidenceReference,
      adminId: req.user._id,
      session,
      lines: [
        { account: FINANCIAL_ACCOUNTS.promotionalReserve, debit: amount },
        { account: FINANCIAL_ACCOUNTS.companyBank, credit: amount },
      ],
    };
    const existing = await FinancialJournal.findOne({ idempotencyKey: journalData.idempotencyKey })
      .select("+fingerprint")
      .session(session);
    if (!existing) {
      const bankBalance = await getAccountBalance(FINANCIAL_ACCOUNTS.companyBank, session);
      if (bankBalance + 0.000001 < amount) {
        await session.abortTransaction();
        return res.status(409).json({
          message: "The promotional reserve cannot exceed the available company-bank ledger balance.",
        });
      }
    }
    const result = await postFinancialJournal({ ...journalData, session });

    if (result.created) {
      const reserve = await PromotionalReserve.findOneAndUpdate(
        { key: "primary" },
        { $inc: { fundedBalance: amount, availableBalance: amount } },
        { new: true, upsert: true, setDefaultsOnInsert: true, session },
      );
      if (!reserve) throw new Error("Promotional reserve balance could not be updated.");
      await AdminActivityLog.create([{
        adminId: req.user._id,
        adminName: req.user.fullName || req.user.username || "Admin",
        action: "promotional_reserve_funded",
        description: `Promotional reserve funded from company-bank ledger (${reference}).`,
        ipAddress: req.ip || "Unknown",
        userAgent: req.get("user-agent") || "Unknown",
      }], { session });
    }

    await session.commitTransaction();
    return res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      reference,
      amount,
      balances: await getPromotionalReserveBalances(),
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    if (error.code === 11000 || /idempotency key was reused/.test(error.message || "")) {
      return res.status(409).json({ message: "The funding reference has already been used with different details." });
    }
    if (/Ledger amounts must|valid date/.test(error.message || "")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Promotional reserve funding failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Reserve funding was not committed." });
  } finally {
    await session.endSession();
  }
};

export const updateWelcomeBonusStatus = async (req, res) => {
  try {
    const enabled = req.body.enabled;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled must be a boolean." });
    }

    const settings = await getSettings();
    if (enabled) {
      const amount = Number(settings.welcomeBonus);
      if (!isPositiveMoney(amount)) {
        return res.status(409).json({ message: "The configured welcome bonus amount is invalid." });
      }
      const reserve = await PromotionalReserve.findOne({ key: "primary" }).lean();
      const balances = await getPromotionalReserveBalances();
      if (!reserve || !balances.reconciled || Number(reserve.availableBalance) < amount) {
        return res.status(409).json({ message: "Fund the promotional reserve before enabling welcome bonuses." });
      }
    }

    const updated = await updateSettings({
      welcomeBonusEnabled: enabled,
      ...(enabled && !(settings.welcomeBonusEnabledAt instanceof Date)
        ? { welcomeBonusEnabledAt: new Date() }
        : {}),
    });
    await logAdminActivity({
      admin: req.user,
      action: enabled ? "welcome_bonus_enabled" : "welcome_bonus_disabled",
      description: `Welcome bonus ${enabled ? "enabled" : "disabled"}; configured amount ₦${Number(updated.welcomeBonus)}.`,
      req,
    });
    return res.json({ success: true, enabled: updated.welcomeBonusEnabled === true });
  } catch (error) {
    console.error("Welcome bonus status update failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Welcome bonus status could not be updated." });
  }
};
