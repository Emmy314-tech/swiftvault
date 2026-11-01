import mongoose from "mongoose";
import AdminActivityLog from "../models/AdminActivityLog.js";
import FinancialJournal from "../models/FinancialJournal.js";
import FinancialLedgerControl from "../models/FinancialLedgerControl.js";
import FinancialLedgerBackfillIssue from "../models/FinancialLedgerBackfillIssue.js";
import FundingException from "../models/FundingException.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import { FINANCIAL_ACCOUNTS, postFinancialJournal } from "../services/financialLedgerService.js";

const expenseCategories = Object.freeze({
  provider_cost: { account: FINANCIAL_ACCOUNTS.providerCostExpense, category: "provider_cost" },
  provider_fee: { account: FINANCIAL_ACCOUNTS.providerFeeExpense, category: "provider_fee" },
  payment_processor_fee: { account: FINANCIAL_ACCOUNTS.processorFeeExpense, category: "payment_processor_fee" },
  hosting: { account: FINANCIAL_ACCOUNTS.operatingExpense, category: "hosting" },
  maintenance: { account: FINANCIAL_ACCOUNTS.operatingExpense, category: "maintenance" },
  operating_expense: { account: FINANCIAL_ACCOUNTS.operatingExpense, category: "operating_expense" },
  refund: { account: FINANCIAL_ACCOUNTS.refundExpense, category: "refund" },
  chargeback: { account: FINANCIAL_ACCOUNTS.refundExpense, category: "chargeback" },
  other_expense: { account: FINANCIAL_ACCOUNTS.operatingExpense, category: "other_expense" },
});

const parseDate = (value, name) => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${name} must be a valid date.`);
  return date;
};

export const parseLedgerFilter = (query) => {
  const filter = {};
  const from = parseDate(query.from, "from");
  const to = parseDate(query.to, "to");
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(query.to))) to.setUTCHours(23, 59, 59, 999);
  if (from && to && from > to) throw new Error("from must not be later than to.");
  if (from || to) filter.occurredAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (query.category) {
    if (!FinancialJournal.schema.path("category").enumValues.includes(query.category)) {
      throw new Error("Unknown financial category.");
    }
    filter.category = query.category;
  }
  if (query.accountClass) {
    if (!["revenue", "expenses"].includes(query.accountClass)) {
      throw new Error("Unknown financial account class.");
    }
    filter["lines.account"] = { $regex: `^${query.accountClass}:` };
  }
  if (query.status) {
    if (!["success", "pending", "failed", "held", "paid", "incurred"].includes(query.status)) {
      throw new Error("Unknown financial status.");
    }
    filter.sourceStatus = query.status;
  }
  if (query.reference) {
    const reference = String(query.reference).trim();
    if (reference.length > 120) throw new Error("Reference filter is too long.");
    const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.sourceReference = { $regex: escaped, $options: "i" };
  }
  return filter;
};

const getReadyControl = async () => {
  const control = await FinancialLedgerControl.findOne({ key: "primary" }).lean();
  if (control?.reportingStatus !== "ready" || control.unresolvedSourceCount !== 0) return null;
  if (await FinancialLedgerBackfillIssue.exists({ status: "open" })) return null;
  return control;
};

export const getFinancialLedgerStatus = async (req, res) => {
  try {
    const control = await FinancialLedgerControl.findOne({ key: "primary" }).lean();
    const unresolvedSourceCount = await FinancialLedgerBackfillIssue.countDocuments({ status: "open" });
    return res.json({
      ready: control?.reportingStatus === "ready" && unresolvedSourceCount === 0,
      reportingStatus: control?.reportingStatus || "uninitialized",
      unresolvedSourceCount,
      backfillCompletedAt: control?.backfillCompletedAt || null,
      approvalReference: control?.approvalReference || null,
      limitation: "External provider and bank statement reconciliation is not configured.",
    });
  } catch (error) {
    console.error("Financial ledger status check failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Financial ledger status is unavailable." });
  }
};

export const listFinancialLedgerBackfillIssues = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const status = req.query.status === "resolved" ? "resolved" : "open";
    const [issues, total] = await Promise.all([
      FinancialLedgerBackfillIssue.find({ status })
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      FinancialLedgerBackfillIssue.countDocuments({ status }),
    ]);
    return res.json({ issues, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Financial backfill issue listing failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Financial backfill issues could not be loaded." });
  }
};

const accountGroups = async (filter = {}) => FinancialJournal.aggregate([
  { $match: filter },
  { $unwind: "$lines" },
  {
    $group: {
      _id: { account: "$lines.account", category: "$category", serviceType: "$serviceType" },
      debit: { $sum: "$lines.debit" },
      credit: { $sum: "$lines.credit" },
    },
  },
]);

export const getWalletReconciliation = async () => {
  const result = await User.aggregate([
    { $match: { role: { $ne: "admin" } } },
    {
      $lookup: {
        from: FinancialJournal.collection.name,
        let: { ledgerUserId: "$_id" },
        pipeline: [
          { $unwind: "$lines" },
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$lines.userId", "$$ledgerUserId"] },
                  { $in: ["$lines.account", [FINANCIAL_ACCOUNTS.customerWallet, FINANCIAL_ACCOUNTS.customerBonusWallet]] },
                ],
              },
            },
          },
          {
            $group: {
              _id: "$lines.account",
              net: { $sum: { $subtract: ["$lines.credit", "$lines.debit"] } },
            },
          },
        ],
        as: "ledgerBalances",
      },
    },
    {
      $set: {
        ledgerWallet: {
          $ifNull: [
            { $first: { $filter: { input: "$ledgerBalances", as: "entry", cond: { $eq: ["$$entry._id", FINANCIAL_ACCOUNTS.customerWallet] } } } },
            { net: 0 },
          ],
        },
        ledgerBonus: {
          $ifNull: [
            { $first: { $filter: { input: "$ledgerBalances", as: "entry", cond: { $eq: ["$$entry._id", FINANCIAL_ACCOUNTS.customerBonusWallet] } } } },
            { net: 0 },
          ],
        },
      },
    },
    {
      $set: {
        walletLedgerBalance: { $round: ["$ledgerWallet.net", 2] },
        bonusLedgerBalance: { $round: ["$ledgerBonus.net", 2] },
        walletDifference: { $round: [{ $subtract: [{ $ifNull: ["$walletBalance", 0] }, "$ledgerWallet.net"] }, 2] },
        bonusDifference: { $round: [{ $subtract: [{ $ifNull: ["$bonusBalance", 0] }, "$ledgerBonus.net"] }, 2] },
      },
    },
    {
      $match: {
        $or: [
          { walletDifference: { $ne: 0 } },
          { bonusDifference: { $ne: 0 } },
        ],
      },
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              userCount: { $sum: 1 },
              absoluteDifference: { $sum: { $add: [{ $abs: "$walletDifference" }, { $abs: "$bonusDifference" }] } },
            },
          },
        ],
        sample: [
          { $sort: { walletDifference: -1 } },
          { $limit: 25 },
          {
            $project: {
              _id: 0,
              userId: "$_id",
              walletBalance: { $ifNull: ["$walletBalance", 0] },
              walletLedgerBalance: 1,
              walletDifference: 1,
              bonusBalance: { $ifNull: ["$bonusBalance", 0] },
              bonusLedgerBalance: 1,
              bonusDifference: 1,
            },
          },
        ],
      },
    },
  ]);
  return {
    userCount: result[0]?.summary[0]?.userCount || 0,
    absoluteDifference: result[0]?.summary[0]?.absoluteDifference || 0,
    sample: result[0]?.sample || [],
  };
};

const netForAccount = (rows, account) => rows
  .filter((row) => row._id.account === account)
  .reduce((sum, row) => sum + Number(row.credit) - Number(row.debit), 0);

export const debitBalanceForAccount = (rows, account) => rows
  .filter((row) => row._id.account === account)
  .reduce((sum, row) => sum + Number(row.debit) - Number(row.credit), 0);

const expensesForAccount = (rows, account) => -netForAccount(rows, account);

export const getFinancialLedgerReport = async (req, res) => {
  try {
    const control = await getReadyControl();
    if (!control) {
      return res.status(503).json({
        success: false,
        code: "FINANCIAL_HISTORY_NOT_RECONCILED",
        message: "Financial reports are disabled until the evidence-based legacy backfill is complete and all unresolved source records are reviewed.",
      });
    }
    const filter = parseLedgerFilter(req.query);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const [rows, total, entries, pendingFunding, heldFunding, walletReconciliation] = await Promise.all([
      accountGroups(filter),
      FinancialJournal.countDocuments(filter),
      FinancialJournal.find(filter)
        .select("-fingerprint")
        .populate("userId", "username")
        .populate("counterpartyUserId", "username")
        .populate("adminId", "username")
        .sort({ occurredAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Transaction.aggregate([
        { $match: { type: "wallet_funding", status: "pending" } },
        { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      FundingException.aggregate([
        { $match: { status: "held" } },
        { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      getWalletReconciliation(),
    ]);

    const incomeRows = rows.filter((row) => row._id.account.startsWith("revenue:"));
    const expenseRows = rows.filter((row) => row._id.account.startsWith("expenses:"));
    const totalIncome = incomeRows.reduce((sum, row) => sum + Number(row.credit) - Number(row.debit), 0);
    const totalExpenses = expenseRows.reduce((sum, row) => sum + Number(row.debit) - Number(row.credit), 0);
    const lifetimeRows = await accountGroups({});
    const liabilityBalance = (account) => -netForAccount(lifetimeRows, account);
    const serviceRevenue = netForAccount(rows, FINANCIAL_ACCOUNTS.serviceRevenue);
    const providerCommissionIncome = netForAccount(rows, FINANCIAL_ACCOUNTS.providerCommissionRevenue);
    const providerCosts = expensesForAccount(rows, FINANCIAL_ACCOUNTS.providerCostExpense);
    const providerFees = expensesForAccount(rows, FINANCIAL_ACCOUNTS.providerFeeExpense);
    const processorFees = expensesForAccount(rows, FINANCIAL_ACCOUNTS.processorFeeExpense);

    return res.json({
      filters: {
        from: req.query.from || null,
        to: req.query.to || null,
        category: req.query.category || null,
        accountClass: req.query.accountClass || null,
        status: req.query.status || null,
        reference: req.query.reference || null,
      },
      summary: {
        totalIncome,
        totalExpenses,
        netOperatingResult: totalIncome - totalExpenses,
        membershipRevenue: netForAccount(rows, FINANCIAL_ACCOUNTS.membershipRevenue),
        serviceRevenue,
        providerCommissionIncome,
        transferFeeIncome: netForAccount(rows, FINANCIAL_ACCOUNTS.transferFeeRevenue),
        providerCommissionReceivable: lifetimeRows
          .filter((row) => row._id.account === FINANCIAL_ACCOUNTS.providerReceivable)
          .reduce((sum, row) => sum + Number(row.debit) - Number(row.credit), 0),
        referralBonusExpenses: expensesForAccount(rows, FINANCIAL_ACCOUNTS.referralExpense),
        providerCosts,
        providerFees,
        paymentProcessorFees: processorFees,
        vtuMargin: serviceRevenue - providerCosts - providerFees,
        operatingExpenses: expenseRows
          .filter((row) => row._id.account === FINANCIAL_ACCOUNTS.operatingExpense)
          .reduce((sum, row) => sum + Number(row.debit) - Number(row.credit), 0),
        refundsAndChargebacks: expensesForAccount(rows, FINANCIAL_ACCOUNTS.refundExpense),
        customerWalletLiabilities: liabilityBalance(FINANCIAL_ACCOUNTS.customerWallet) +
          liabilityBalance(FINANCIAL_ACCOUNTS.customerBonusWallet),
        fundingSuspenseLiability: liabilityBalance(FINANCIAL_ACCOUNTS.fundingSuspense),
        pendingServiceLiability: liabilityBalance(FINANCIAL_ACCOUNTS.pendingService),
        pendingBankTransferLiability: liabilityBalance(FINANCIAL_ACCOUNTS.pendingTransfer) +
          liabilityBalance(FINANCIAL_ACCOUNTS.pendingTransferFee),
        providerClearingBalance: debitBalanceForAccount(lifetimeRows, FINANCIAL_ACCOUNTS.providerClearing),
        pendingDeposits: pendingFunding[0] || { amount: 0, count: 0 },
        quarantinedDeposits: heldFunding[0] || { amount: 0, count: 0 },
        walletReconciliation: walletReconciliation,
        externalStatementReconciliation: "NOT_CONFIGURED",
      },
      entries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      backfillCompletedAt: control.backfillCompletedAt,
      approvalReference: control.approvalReference,
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("valid date") || error.message.includes("Unknown financial") || error.message.includes("must not be later"))) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Financial ledger report failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Financial report could not be generated." });
  }
};

const csvCell = (value) => {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const exportFinancialLedger = async (req, res) => {
  try {
    const control = await getReadyControl();
    if (!control) {
      return res.status(503).json({
        success: false,
        code: "FINANCIAL_HISTORY_NOT_RECONCILED",
        message: "Export is disabled until evidence-based legacy reconciliation is complete.",
      });
    }
    const filter = parseLedgerFilter(req.query);
    const accountPrefix = req.query.accountClass ? `${req.query.accountClass}:` : null;
    res.status(200);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="swiftvault-financial-ledger.csv"');
    res.write("occurredAt,category,status,reference,account,debit,credit,userId,counterpartyUserId,adminId,description\r\n");
    const cursor = FinancialJournal.find(filter).sort({ occurredAt: -1, _id: -1 }).cursor();
    for await (const journal of cursor) {
      for (const line of journal.lines) {
        if (accountPrefix && !line.account.startsWith(accountPrefix)) continue;
        const row = [
          journal.occurredAt?.toISOString(),
          journal.category,
          journal.sourceStatus,
          journal.sourceReference,
          line.account,
          line.debit,
          line.credit,
          line.userId,
          journal.counterpartyUserId,
          journal.adminId,
          journal.description,
        ];
        res.write(`${row.map(csvCell).join(",")}\r\n`);
      }
    }
    return res.end();
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes("valid date") ||
      error.message.includes("Unknown financial") ||
      error.message.includes("must not be later")
    )) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Financial ledger export failed:", error.code || error.name || "unclassified_error");
    if (!res.headersSent) return res.status(500).json({ message: "Financial report export could not be generated." });
    return res.destroy(error);
  }
};

export const recordOperatingExpense = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { amount, category, reference, description, evidenceReference, settlementStatus = "incurred", occurredAt } = req.body;
    const numericAmount = Number(amount);
    const expense = expenseCategories[category];
    const cleanReference = String(reference || "").trim();
    const cleanDescription = String(description || "").trim();
    const cleanEvidence = String(evidenceReference || "").trim();
    const date = parseDate(occurredAt, "occurredAt") || new Date();
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !expense ||
      !cleanReference || cleanReference.length > 120 ||
      !cleanDescription || cleanDescription.length > 500 ||
      !cleanEvidence || cleanEvidence.length > 200 ||
      !["paid", "incurred"].includes(settlementStatus)) {
      return res.status(400).json({ message: "Provide a positive amount, supported expense category, unique reference, description, evidence reference, and valid settlement status." });
    }
    if (FinancialJournal.schema.path("category").enumValues.includes(category) === false) {
      return res.status(400).json({ message: "Unsupported expense category." });
    }
    session.startTransaction();
    const result = await postFinancialJournal({
      idempotencyKey: `admin-expense:${cleanReference}`,
      sourceType: "admin_expense",
      sourceId: cleanReference,
      sourceReference: cleanReference,
      category: expense.category,
      description: cleanDescription,
      sourceStatus: settlementStatus,
      evidenceReference: cleanEvidence,
      occurredAt: date,
      adminId: req.user._id,
      session,
      lines: [
        { account: expense.account, debit: numericAmount },
        {
          account: settlementStatus === "paid" ? FINANCIAL_ACCOUNTS.businessCash : FINANCIAL_ACCOUNTS.expensePayable,
          credit: numericAmount,
        },
      ],
    });
    if (result.created) {
      await AdminActivityLog.create([{
        adminId: req.user._id,
        adminName: req.user.fullName || req.user.username || "Admin",
        action: "financial_expense_recorded",
        description: `${category} expense ${cleanReference} recorded (${settlementStatus}).`,
        ipAddress: req.ip || "Unknown",
        userAgent: req.get("user-agent") || "Unknown",
      }], { session });
    }
    await session.commitTransaction();
    return res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      journalId: result.journal._id,
      reference: cleanReference,
      category,
      settlementStatus,
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    if (error.code === 11000 || /idempotency key was reused/.test(error.message || "")) {
      return res.status(409).json({ message: "That expense reference has already been recorded with different accounting data." });
    }
    if (/valid date|Ledger amounts must/.test(error.message)) return res.status(400).json({ message: error.message });
    console.error("Operating expense recording failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Expense could not be recorded. No ledger entry was committed." });
  } finally {
    await session.endSession();
  }
};

export const recordProviderCommission = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const {
      amount,
      reference,
      description,
      evidenceReference,
      settlementStatus = "success",
      occurredAt,
    } = req.body;
    const numericAmount = Number(amount);
    const cleanReference = String(reference || "").trim();
    const cleanDescription = String(description || "").trim();
    const cleanEvidence = String(evidenceReference || "").trim();
    const date = parseDate(occurredAt, "occurredAt") || new Date();

    if (!Number.isFinite(numericAmount) || numericAmount <= 0 ||
      !cleanReference || cleanReference.length > 120 ||
      !cleanDescription || cleanDescription.length > 500 ||
      !cleanEvidence || cleanEvidence.length > 200 ||
      !["success", "paid"].includes(settlementStatus)) {
      return res.status(400).json({
        message: "Provide a positive earned commission, unique reference, description, evidence reference, and valid settlement status.",
      });
    }

    session.startTransaction();
    const result = await postFinancialJournal({
      idempotencyKey: `provider-commission:${cleanReference}`,
      sourceType: "provider_commission",
      sourceId: cleanReference,
      sourceReference: cleanReference,
      category: "provider_commission",
      description: cleanDescription,
      sourceStatus: settlementStatus,
      evidenceReference: cleanEvidence,
      occurredAt: date,
      adminId: req.user._id,
      session,
      lines: [
        {
          account: settlementStatus === "paid"
            ? FINANCIAL_ACCOUNTS.companyBank
            : FINANCIAL_ACCOUNTS.providerReceivable,
          debit: numericAmount,
        },
        { account: FINANCIAL_ACCOUNTS.providerCommissionRevenue, credit: numericAmount },
      ],
    });
    if (result.created) {
      await AdminActivityLog.create([{
        adminId: req.user._id,
        adminName: req.user.fullName || req.user.username || "Admin",
        action: "provider_commission_recorded",
        description: `Provider commission ${cleanReference} recorded (${settlementStatus}).`,
        ipAddress: req.ip || "Unknown",
        userAgent: req.get("user-agent") || "Unknown",
      }], { session });
    }
    await session.commitTransaction();
    return res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      journalId: result.journal._id,
      reference: cleanReference,
      category: "provider_commission",
      settlementStatus,
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    if (error.code === 11000 || /idempotency key was reused/.test(error.message || "")) {
      return res.status(409).json({ message: "That provider commission reference has already been recorded with different accounting data." });
    }
    if (/valid date|Ledger amounts must/.test(error.message)) return res.status(400).json({ message: error.message });
    console.error("Provider commission recording failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Provider commission could not be recorded. No ledger entry was committed." });
  } finally {
    await session.endSession();
  }
};

export const settleProviderCommission = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const commissionReference = String(req.body.commissionReference || "").trim();
    const settlementReference = String(req.body.settlementReference || "").trim();
    const evidenceReference = String(req.body.evidenceReference || "").trim();
    const date = parseDate(req.body.occurredAt, "occurredAt") || new Date();
    if (!commissionReference || commissionReference.length > 120 ||
      !settlementReference || settlementReference.length > 120 ||
      !evidenceReference || evidenceReference.length > 200) {
      return res.status(400).json({
        message: "A commission reference, unique settlement reference, and settlement evidence reference are required.",
      });
    }

    session.startTransaction();
    const commission = await FinancialJournal.findOne({
      idempotencyKey: `provider-commission:${commissionReference}`,
      category: "provider_commission",
      sourceStatus: "success",
    }).session(session);
    if (!commission) {
      await session.abortTransaction();
      return res.status(404).json({ message: "An earned, unpaid provider commission with that reference was not found." });
    }

    const receivableLine = commission.lines.find((line) =>
      line.account === FINANCIAL_ACCOUNTS.providerReceivable && line.debit > 0
    );
    const revenueLine = commission.lines.find((line) =>
      line.account === FINANCIAL_ACCOUNTS.providerCommissionRevenue && line.credit > 0
    );
    if (!receivableLine || !revenueLine || receivableLine.debit !== revenueLine.credit) {
      await session.abortTransaction();
      return res.status(409).json({ message: "The commission entry does not contain a matching provider receivable and revenue." });
    }

    const result = await postFinancialJournal({
      idempotencyKey: `provider-commission-settlement:${settlementReference}`,
      sourceType: "provider_commission_settlement",
      sourceId: commission._id,
      sourceReference: settlementReference,
      category: "provider_commission_settlement",
      description: `Settlement of provider commission ${commissionReference}.`,
      sourceStatus: "paid",
      evidenceReference,
      occurredAt: date,
      adminId: req.user._id,
      settlesJournal: commission._id,
      session,
      lines: [
        { account: FINANCIAL_ACCOUNTS.companyBank, debit: receivableLine.debit },
        { account: FINANCIAL_ACCOUNTS.providerReceivable, credit: receivableLine.debit },
      ],
    });
    if (result.created) {
      await AdminActivityLog.create([{
        adminId: req.user._id,
        adminName: req.user.fullName || req.user.username || "Admin",
        action: "provider_commission_settled",
        description: `Provider commission ${commissionReference} settlement ${settlementReference} recorded.`,
        ipAddress: req.ip || "Unknown",
        userAgent: req.get("user-agent") || "Unknown",
      }], { session });
    }
    await session.commitTransaction();
    return res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      journalId: result.journal._id,
      commissionReference,
      settlementReference,
      amount: receivableLine.debit,
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    if (error.code === 11000 || /idempotency key was reused/.test(error.message || "")) {
      return res.status(409).json({ message: "That provider commission is already settled or the settlement reference was reused." });
    }
    if (/valid date|Ledger amounts must/.test(error.message)) return res.status(400).json({ message: error.message });
    console.error("Provider commission settlement failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Provider commission settlement could not be committed." });
  } finally {
    await session.endSession();
  }
};

export const reverseOperatingExpense = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const reference = String(req.params.reference || "").trim();
    const reason = String(req.body.reason || "").trim();
    if (!reference || reference.length > 120 || !reason || reason.length > 500) {
      return res.status(400).json({ message: "A valid expense reference and reversal reason are required." });
    }
    session.startTransaction();
    const original = await FinancialJournal.findOne({
      idempotencyKey: `admin-expense:${reference}`,
      sourceType: "admin_expense",
    }).session(session);
    if (!original) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Expense entry not found." });
    }
    const result = await postFinancialJournal({
      idempotencyKey: `admin-expense-reversal:${original._id}`,
      sourceType: "admin_expense_reversal",
      sourceId: original._id,
      sourceReference: reference,
      sourceTransactionId: original.sourceTransactionId,
      category: "refund",
      description: `Reversal of expense ${reference}: ${reason}`,
      sourceStatus: "success",
      occurredAt: new Date(),
      userId: original.userId,
      adminId: req.user._id,
      reversalOf: original._id,
      session,
      lines: original.lines.map((line) => ({
        account: line.account,
        debit: line.credit,
        credit: line.debit,
        userId: line.userId,
      })),
    });
    await AdminActivityLog.create([{
      adminId: req.user._id,
      adminName: req.user.fullName || req.user.username || "Admin",
      action: "financial_expense_reversed",
      description: `Expense ${reference} reversed: ${reason}`,
      ipAddress: req.ip || "Unknown",
      userAgent: req.get("user-agent") || "Unknown",
    }], { session });
    await session.commitTransaction();
    return res.json({ success: true, created: result.created, journalId: result.journal._id, reference });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    if (error.code === 11000 || /idempotency key was reused/.test(error.message || "")) {
      return res.status(409).json({ message: "That expense has already been reversed or its reversal reference conflicts." });
    }
    console.error("Operating expense reversal failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Expense reversal could not be committed." });
  } finally {
    await session.endSession();
  }
};
