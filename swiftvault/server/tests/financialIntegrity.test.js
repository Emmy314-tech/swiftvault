import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import test from "node:test";
import mongoose from "mongoose";
import Transaction from "../models/Transaction.js";
import FinancialJournal from "../models/FinancialJournal.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import PromotionalReserve from "../models/PromotionalReserve.js";
import AuthSession from "../models/AuthSession.js";
import Notification from "../models/Notification.js";
import FinancialAuditLog from "../models/FinancialAuditLog.js";
import ReconciliationAttempt from "../models/ReconciliationAttempt.js";
import CompanyWallet from "../models/CompanyWallet.js";
import { classifyPeyflexResponse, isDefinitivePeyflexFailure } from "../services/providerOutcome.js";
import { recordPendingVtuSale, refundPendingVtuPurchase } from "../services/vtuSettlement.js";
import { settlePendingTransaction } from "../services/transactionReconciliation.js";
import { isSafeReconciliationNote } from "../services/reconciliationProvider.js";
import { createPurchaseFingerprint, idempotencyConflictResponse } from "../services/purchaseIdempotency.js";
import { isPositiveFiniteAmount, isPositiveInteger } from "../utils/financialValidation.js";
import { protect } from "../middleware/authMiddleware.js";
import { setAdminPin, setPin } from "../controllers/pinController.js";
import { requireAdminPin } from "../middleware/requireAdminPin.js";
import { claimWelcomeBonus, getProfile } from "../controllers/userController.js";
import { getAdminDashboard } from "../controllers/adminController.js";
import { debitBalanceForAccount } from "../controllers/financialLedgerController.js";
import { sendMoney } from "../controllers/transferController.js";
import { requirePurchaseIdempotency } from "../middleware/purchaseIdempotency.js";
import { FINANCIAL_ACCOUNTS } from "../services/financialLedgerService.js";
import {
  allocateWalletDebit,
  creditWallet,
  debitWallet,
} from "../services/walletService.js";
import { invalidateSettingsCache, updateSettings } from "../services/settingsService.js";

const response = () => {
  let statusCode = 200;
  let body;
  return {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
};

test.beforeEach((context) => {
  context.mock.method(FinancialJournal, "findOne", (filter) => {
    const key = filter.idempotencyKey;
    let lines = null;
    if (key === "vtu-reserve:bonus-purchase") {
      lines = null;
    } else if (["vtu-reserve:bonus-refund", "vtu-reserve:bonus-reconcile"].includes(key)) {
      lines = [
        { account: FINANCIAL_ACCOUNTS.customerWallet, debit: 40, credit: 0 },
        { account: FINANCIAL_ACCOUNTS.customerBonusWallet, debit: 20, credit: 0 },
        { account: FINANCIAL_ACCOUNTS.pendingService, debit: 0, credit: 60 },
      ];
    } else if (key?.startsWith("vtu-reserve:")) {
      lines = [
        { account: FINANCIAL_ACCOUNTS.customerWallet, debit: 100, credit: 0 },
        { account: FINANCIAL_ACCOUNTS.pendingService, debit: 0, credit: 100 },
      ];
    } else if (key?.startsWith("company-withdrawal-reserve:")) {
      lines = [
        { account: FINANCIAL_ACCOUNTS.pendingCompanyWithdrawal, debit: 70, credit: 0 },
        { account: FINANCIAL_ACCOUNTS.providerClearing, debit: 0, credit: 70 },
      ];
    } else if (key?.startsWith("bank-transfer-reserve:")) {
      lines = [
        { account: FINANCIAL_ACCOUNTS.customerWallet, debit: 100, credit: 0 },
        { account: FINANCIAL_ACCOUNTS.pendingTransfer, debit: 0, credit: 100 },
      ];
    }
    return {
      select() { return this; },
      session: async () => lines
        ? { _id: new mongoose.Types.ObjectId(), idempotencyKey: key, lines }
        : null,
    };
  });
  context.mock.method(FinancialJournal, "create", async ([journal]) => [journal]);
});

test("asset account balances use debit-normal accounting", () => {
  assert.equal(debitBalanceForAccount([
    { _id: { account: FINANCIAL_ACCOUNTS.providerClearing }, debit: 250, credit: 70 },
    { _id: { account: FINANCIAL_ACCOUNTS.customerWallet }, debit: 500, credit: 500 },
  ], FINANCIAL_ACCOUNTS.providerClearing), 180);
});

test("generic wallet mutations fail closed unless a journaled operation is used", async () => {
  await assert.rejects(creditWallet("user-id", 10, "credit", "legacy credit"), {
    code: "JOURNALED_OPERATION_REQUIRED",
  });
  await assert.rejects(debitWallet("user-id", 10, "debit", "legacy debit"), {
    code: "JOURNALED_OPERATION_REQUIRED",
  });
});

test("admin transaction volume excludes mirrored wallet-received rows", async (context) => {
  let pipeline;
  context.mock.method(Transaction, "aggregate", async (aggregationPipeline) => {
    pipeline = aggregationPipeline;
    return [{ totalVolume: 250, count: 1 }];
  });
  context.mock.method(User, "countDocuments", async () => 1);
  const res = response();

  await getAdminDashboard({}, res);

  assert.deepEqual(pipeline[0].$match, {
    status: "success",
    type: { $ne: "wallet_received" },
  });
  assert.equal(res.body.totalVolume, 250);
});

test("wallet funding references and user transaction idempotency have database uniqueness constraints", () => {
  const index = Transaction.schema.indexes().find(([, options]) => options.name === "unique_wallet_funding_reference");

  assert.ok(index);
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[0], { reference: 1 });
  const idempotencyIndexes = Transaction.schema.indexes().filter(([, options]) => options.unique === true);
  assert.equal(idempotencyIndexes.length, 6);
  const requestIdempotencyIndex = idempotencyIndexes.find(([, options]) => options.name === "unique_user_transaction_idempotency_key");
  assert.ok(requestIdempotencyIndex);
  assert.deepEqual(requestIdempotencyIndex[0], { userId: 1, idempotencyKey: 1 });
  assert.ok(idempotencyIndexes.some(([, options]) => options.name === "unique_paid_upgrade_per_user"));
  assert.ok(idempotencyIndexes.some(([, options]) => options.name === "unique_upgrade_payment_reference"));
  assert.ok(idempotencyIndexes.some(([, options]) => options.name === "unique_referral_bonus_source"));
});

test("Peyflex unknown and pending responses are not treated as successful", () => {
  assert.equal(classifyPeyflexResponse({}), "pending");
  assert.equal(classifyPeyflexResponse({ status: "PENDING" }), "pending");
  assert.equal(classifyPeyflexResponse({ responseStatus: "FAILED" }), "pending");
  assert.equal(classifyPeyflexResponse({ success: true, status: "FAILED" }), "pending");
  assert.equal(classifyPeyflexResponse({ status: "SUCCESS" }), "pending");
  assert.equal(classifyPeyflexResponse({ status: "ERROR" }), "pending");
  assert.equal(classifyPeyflexResponse({ status: "REJECTED" }), "pending");
  assert.equal(classifyPeyflexResponse({ success: false, status: "SUCCESS" }), "pending");
  assert.equal(classifyPeyflexResponse({ success: true }), "pending");
  assert.equal(classifyPeyflexResponse({ status: "SUCCEEDED" }), "pending");
  assert.equal(classifyPeyflexResponse({ status: "COMPLETED" }), "pending");
  assert.equal(isDefinitivePeyflexFailure({ code: "ETIMEDOUT" }), false);
  assert.equal(isDefinitivePeyflexFailure({ response: { status: 503 } }), false);
  assert.equal(isDefinitivePeyflexFailure({ response: { status: 422, data: { message: "Rejected" } } }), false);
  assert.equal(isDefinitivePeyflexFailure({ response: { status: 400, data: { status: "FAILED", message: "Insufficient wallet balance" } } }), false);
  assert.equal(isDefinitivePeyflexFailure({ response: { status: 500, data: { status: "FAILED" } } }), false);
  assert.equal(isDefinitivePeyflexFailure({ response: { status: 429, data: { status: "FAILED" } } }), false);
  assert.equal(isDefinitivePeyflexFailure({ code: "PEYFLEX_NOT_CONFIGURED" }), true);
});

test("malformed and ambiguous Peyflex responses remain pending", () => {
  assert.equal(classifyPeyflexResponse("not-json"), "pending");
  assert.equal(classifyPeyflexResponse({ status: "UNKNOWN", success: true }), "pending");
  assert.equal(isDefinitivePeyflexFailure({ code: "ECONNABORTED" }), false);
  assert.equal(isDefinitivePeyflexFailure({ response: { status: 400, data: "Insufficient wallet balance" } }), false);
  assert.equal(isDefinitivePeyflexFailure({ response: { status: 401, data: { detail: "Unauthorized" } } }), false);
});

test("a pending VTU refund credits once and ignores a repeated failure", async (context) => {
  let sessionActive = false;
  let refundAvailable = true;
  let committed = 0;
  let aborted = 0;
  let ended = 0;
  const session = {
    inTransaction: () => sessionActive,
    startTransaction: () => { sessionActive = true; },
    commitTransaction: async () => { committed += 1; sessionActive = false; },
    abortTransaction: async () => { aborted += 1; sessionActive = false; },
    endSession: async () => { ended += 1; },
  };
  const user = { walletBalance: 0, bonusBalance: 5, save: async () => {} };

  context.mock.method(mongoose, "startSession", async () => session);
  context.mock.method(Transaction, "findOneAndUpdate", async () => {
    if (!refundAvailable) return null;
    refundAvailable = false;
    return {
      _id: "bonus-refund",
      amount: 60,
      reference: "VTU-REFUND",
      walletAllocation: { wallet: 40, bonus: 20 },
    };
  });
  context.mock.method(User, "findById", () => ({ session: async () => user }));

  assert.equal(await refundPendingVtuPurchase("bonus-refund", "user-id"), true);
  assert.equal(user.walletBalance, 40);
  assert.equal(user.bonusBalance, 25);
  assert.equal(await refundPendingVtuPurchase("bonus-refund", "user-id"), false);
  assert.equal(user.walletBalance, 40);
  assert.equal(user.bonusBalance, 25);
  assert.equal(committed, 1);
  assert.equal(aborted, 1);
  assert.equal(ended, 2);
});

test("manual VTU failure reconciliation restores cash and promotional allocations", async (context) => {
  let active = false;
  const session = {
    inTransaction: () => active,
    startTransaction: () => { active = true; },
    commitTransaction: async () => { active = false; },
    abortTransaction: async () => { active = false; },
    endSession: async () => {},
  };
  const pending = {
    _id: "bonus-reconcile",
    userId: "user-id",
    type: "airtime",
    amount: 60,
    reference: "VTU-RECONCILE",
    walletAllocation: { wallet: 40, bonus: 20 },
  };
  const claimed = { ...pending, status: "failed" };
  const user = { _id: "user-id", walletBalance: 10, bonusBalance: 5, save: async () => {} };
  context.mock.method(mongoose, "startSession", async () => session);
  context.mock.method(Transaction, "findOne", () => ({ session: async () => pending }));
  context.mock.method(Transaction, "findOneAndUpdate", async () => claimed);
  context.mock.method(User, "findById", () => ({ session: async () => user }));
  context.mock.method(ReconciliationAttempt, "create", async () => []);
  context.mock.method(FinancialAuditLog, "create", async () => ({}));
  context.mock.method(Notification, "create", async () => ({}));

  const result = await settlePendingTransaction({
    transactionId: pending._id,
    provider: "peyflex",
    finalStatus: "failed",
    actor: "admin-id",
    mode: "manual",
    reason: "Provider-confirmed failure",
  });

  assert.equal(result.result, "resolved");
  assert.equal(user.walletBalance, 50);
  assert.equal(user.bonusBalance, 25);
  const refundJournal = FinancialJournal.create.mock.calls.find(
    (call) => call.arguments[0][0].idempotencyKey === "vtu-refund:bonus-reconcile"
  )?.arguments[0][0];
  assert.ok(refundJournal);
  assert.deepEqual(
    refundJournal.lines.map(({ account, debit, credit }) => ({ account, debit, credit })),
    [
      { account: FINANCIAL_ACCOUNTS.customerWallet, debit: 0, credit: 40 },
      { account: FINANCIAL_ACCOUNTS.customerBonusWallet, debit: 0, credit: 20 },
      { account: FINANCIAL_ACCOUNTS.pendingService, debit: 60, credit: 0 },
    ],
  );
});

test("financial inputs reject non-finite, non-positive, and fractional quantities", () => {
  assert.equal(isPositiveFiniteAmount("1.25"), true);
  assert.equal(isPositiveFiniteAmount("NaN"), false);
  assert.equal(isPositiveFiniteAmount("Infinity"), false);
  assert.equal(isPositiveFiniteAmount(0), false);
  assert.equal(isPositiveFiniteAmount(-1), false);
  assert.equal(isPositiveInteger("2"), true);
  assert.equal(isPositiveInteger(1.5), false);
  assert.equal(isPositiveInteger(0), false);
});

test("VTU debit allocates cash first and preserves bonus on insufficient funds", () => {
  const user = { walletBalance: 25.25, bonusBalance: 10 };
  assert.deepEqual(allocateWalletDebit(user, 30), { wallet: 25.25, bonus: 4.75 });
  assert.equal(user.walletBalance, 0);
  assert.equal(user.bonusBalance, 5.25);
  assert.throws(() => allocateWalletDebit(user, 6), /Insufficient balance/);
  assert.equal(user.walletBalance, 0);
  assert.equal(user.bonusBalance, 5.25);
});

test("VTU reservation debits cash and bonus liabilities by the persisted allocation", async () => {
  const session = {
    inTransaction: () => true,
  };
  await recordPendingVtuSale({
    _id: "bonus-purchase",
    userId: "user-id",
    reference: "VTU-BONUS-1",
    amount: 60,
    walletAllocation: { wallet: 40, bonus: 20 },
  }, session);

  const journal = FinancialJournal.create.mock.calls.find(
    (call) => call.arguments[0][0].idempotencyKey === "vtu-reserve:bonus-purchase"
  )?.arguments[0][0];
  assert.ok(journal);
  assert.deepEqual(
    journal.lines.map(({ account, debit, credit }) => ({ account, debit, credit })),
    [
      { account: FINANCIAL_ACCOUNTS.customerWallet, debit: 40, credit: 0 },
      { account: FINANCIAL_ACCOUNTS.customerBonusWallet, debit: 20, credit: 0 },
      { account: FINANCIAL_ACCOUNTS.pendingService, debit: 0, credit: 60 },
    ],
  );
});

test("settings updates preserve Date values used to define bonus campaign eligibility", async (context) => {
  invalidateSettingsCache();
  context.after(invalidateSettingsCache);
  const settings = new Settings({ welcomeBonusEnabledAt: null });
  context.mock.method(Settings, "findOne", async () => settings);
  context.mock.method(settings, "save", async () => settings);
  const enabledAt = new Date("2025-01-02T03:04:05.000Z");

  const updated = await updateSettings({ welcomeBonusEnabledAt: enabledAt });
  assert.equal(updated.welcomeBonusEnabledAt.getTime(), enabledAt.getTime());
});

test("profile eligibility is limited to verified users created during the enabled campaign", async (context) => {
  invalidateSettingsCache();
  context.after(invalidateSettingsCache);
  const campaignStart = new Date("2025-01-01T00:00:00.000Z");
  context.mock.method(Settings, "findOne", async () => ({
    welcomeBonus: 100,
    welcomeBonusEnabled: true,
    welcomeBonusEnabledAt: campaignStart,
  }));
  const user = {
    fullName: "New User",
    username: "new-user",
    createdAt: new Date("2025-01-02T00:00:00.000Z"),
    phoneVerified: true,
    walletBalance: 0,
    bonusBalance: 0,
  };
  context.mock.method(User, "findById", async () => user);

  const eligible = response();
  await getProfile({ user: { id: "new-user-id" } }, eligible);
  assert.equal(eligible.body.welcomeBonusEligible, true);
  assert.equal(eligible.body.welcomeBonusAmount, 100);

  user.phoneVerified = false;
  const unverified = response();
  await getProfile({ user: { id: "new-user-id" } }, unverified);
  assert.equal(unverified.body.welcomeBonusEligible, false);

  user.phoneVerified = true;
  user.createdAt = new Date("2024-12-31T23:59:59.999Z");
  const existing = response();
  await getProfile({ user: { id: "new-user-id" } }, existing);
  assert.equal(existing.body.welcomeBonusEligible, false);
});

test("welcome bonus claim credits once from the reserve with a balanced journal", async (context) => {
  let active = false;
  const session = {
    inTransaction: () => active,
    startTransaction: () => { active = true; },
    commitTransaction: async () => { active = false; },
    abortTransaction: async () => { active = false; },
    endSession: async () => {},
  };
  const user = {
    _id: new mongoose.Types.ObjectId(),
    walletBalance: 12,
    bonusBalance: 0,
    createdAt: new Date("2025-02-01T00:00:00.000Z"),
    phoneVerified: true,
    save: async () => {},
  };
  const settings = {
    welcomeBonus: 100,
    welcomeBonusEnabled: true,
    welcomeBonusEnabledAt: new Date("2025-01-01T00:00:00.000Z"),
  };
  const reserve = { availableBalance: 0, awardedTotal: 100 };
  let reserveClaimed = false;
  context.mock.method(mongoose, "startSession", async () => session);
  context.mock.method(User, "findById", () => ({ session: async () => user }));
  context.mock.method(Settings, "findOne", () => ({ session: async () => settings }));
  context.mock.method(Transaction, "findOne", () => ({ session: async () => null }));
  context.mock.method(Transaction, "create", async (documents) => documents);
  context.mock.method(PromotionalReserve, "findOneAndUpdate", async (filter, update, options) => {
    assert.equal(filter.availableBalance.$gte, 100);
    assert.equal(update.$inc.availableBalance, -100);
    assert.equal(update.$inc.awardedTotal, 100);
    assert.equal(options.session, session);
    if (reserveClaimed) return null;
    reserveClaimed = true;
    return reserve;
  });

  const res = response();
  await claimWelcomeBonus({ user: { id: String(user._id) } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(user.bonusBalance, 100);
  assert.ok(user.welcomeBonusAwardedAt instanceof Date);
  const award = Transaction.create.mock.calls[0].arguments[0][0];
  assert.equal(award.type, "welcome_bonus");
  assert.deepEqual(award.walletAllocation, { wallet: 0, bonus: 100 });
  const journal = FinancialJournal.create.mock.calls.find(
    (call) => call.arguments[0][0].category === "welcome_bonus"
  )?.arguments[0][0];
  assert.ok(journal);
  assert.deepEqual(
    journal.lines.map(({ account, debit, credit }) => ({ account, debit, credit })),
    [
      { account: FINANCIAL_ACCOUNTS.promotionalReserve, debit: 100, credit: 0 },
      { account: FINANCIAL_ACCOUNTS.customerBonusWallet, debit: 0, credit: 100 },
    ],
  );
  assert.equal(journal.lines.reduce((sum, line) => sum + line.debit, 0), 100);
  assert.equal(journal.lines.reduce((sum, line) => sum + line.credit, 0), 100);
  assert.equal(reserve.availableBalance, 0);

  const replay = response();
  await claimWelcomeBonus({ user: { id: String(user._id) } }, replay);
  assert.equal(replay.statusCode, 409);
  assert.equal(user.bonusBalance, 100);
  assert.equal(Transaction.create.mock.calls.length, 1);
});

test("financial route auth rejects suspended users before controller execution", async (context) => {
  const testSecret = "unit-test-jwt-secret";
  process.env.JWT_SECRET = testSecret;
  let suspended = true;
  context.mock.method(User, "findById", () => ({
    select: async () => ({ _id: "test-user", authTokenVersion: 0, isSuspended: suspended }),
  }));
  context.mock.method(AuthSession, "findOne", async () => ({ tokenId: "test-session" }));

  const token = jwt.sign({ id: "test-user", sessionId: "test-session", authTokenVersion: 0 }, testSecret);
  let nextCalls = 0;
  let responseStatus = 0;
  const res = {
    status(status) { responseStatus = status; return this; },
    json() { return this; },
  };

  await protect({ headers: { authorization: `Bearer ${token}` } }, res, () => { nextCalls += 1; });
  assert.equal(responseStatus, 403);
  assert.equal(nextCalls, 0);

  suspended = false;
  await protect({ headers: { authorization: `Bearer ${token}` } }, res, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
});

test("duplicate callbacks and concurrent reconciliation issue at most one refund", async (context) => {
  const pendingRecord = {
    _id: "transaction-id",
    userId: "user-id",
    reference: "VTU-1",
    type: "airtime",
    amount: 100,
    providerCost: 95,
    balanceBefore: 300,
    status: "pending",
  };
  let transactionStatus = "pending";
  let balance = 200;
  let committedTransactions = 0;
  let userWrites = 0;
  let logWrites = 0;
  let notificationWrites = 0;
  let auditWrites = 0;

  context.mock.method(mongoose, "startSession", async () => ({
    active: false,
    startTransaction() { this.active = true; },
    inTransaction() { return this.active; },
    async commitTransaction() { this.active = false; committedTransactions += 1; },
    async abortTransaction() { this.active = false; },
    async endSession() {},
  }));
  context.mock.method(Transaction, "findOne", (filter) => ({
    session: async () => transactionStatus === "pending" || filter.status !== "pending"
      ? { ...pendingRecord, status: transactionStatus }
      : null,
  }));
  context.mock.method(Transaction, "findOneAndUpdate", async () => {
    if (transactionStatus !== "pending") return null;
    transactionStatus = "failed";
    return { ...pendingRecord, status: "failed" };
  });
  context.mock.method(User, "findById", () => ({
    session: async () => ({
      walletBalance: balance,
      async save() { userWrites += 1; balance = this.walletBalance; },
    }),
  }));
  context.mock.method(ReconciliationAttempt, "create", async () => { logWrites += 1; });
  context.mock.method(Notification, "create", async () => { notificationWrites += 1; return {}; });
  context.mock.method(FinancialAuditLog, "create", async () => { auditWrites += 1; });

  const results = await Promise.all([
    settlePendingTransaction({ transactionId: "transaction-id", provider: "peyflex", finalStatus: "failed", mode: "manual", reason: "verified failure" }),
    settlePendingTransaction({ transactionId: "transaction-id", provider: "peyflex", finalStatus: "failed", mode: "manual", reason: "duplicate callback" }),
  ]);

  assert.equal(balance, 300);
  assert.equal(userWrites, 1);
  assert.equal(transactionStatus, "failed");
  assert.equal(results.filter((result) => result.result === "resolved").length, 1);
  assert.equal(results.filter((result) => result.result === "already_settled").length, 1);
  assert.equal(committedTransactions, 1);
  assert.equal(logWrites, 2);
  assert.equal(notificationWrites, 1);
  assert.equal(auditWrites, 1);
});

test("Paystack reconciliation cannot settle unsupported bank payout transactions", async (context) => {
  let queries = 0;
  context.mock.method(mongoose, "startSession", async () => ({
    active: false,
    startTransaction() { this.active = true; },
    inTransaction() { return this.active; },
    async commitTransaction() { this.active = false; },
    async abortTransaction() { this.active = false; },
    async endSession() {},
  }));
  context.mock.method(Transaction, "findOne", () => { queries += 1; return { session: async () => null }; });
  context.mock.method(Transaction, "findOneAndUpdate", async () => { queries += 1; return null; });

  await assert.rejects(
    settlePendingTransaction({
      transactionId: "unsupported-payout",
      provider: "paystack",
      finalStatus: "failed",
      mode: "manual",
    }),
    /Unsupported reconciliation provider/
  );
  assert.equal(queries, 0);
});

test("VTU idempotency fingerprints are stable and reject changed payloads", () => {
  const original = createPurchaseFingerprint("airtime", { network: "MTN", phone: "0801", amount: 100 });
  const reordered = createPurchaseFingerprint("airtime", { amount: 100, phone: "0801", network: "MTN" });
  const changed = createPurchaseFingerprint("airtime", { amount: 200, phone: "0801", network: "MTN" });

  assert.equal(original, reordered);
  assert.notEqual(original, changed);
  assert.equal(idempotencyConflictResponse({ requestFingerprint: original, status: "pending", reference: "V-1" }, original).statusCode, 202);
  assert.equal(idempotencyConflictResponse({ requestFingerprint: original, status: "pending" }, changed).statusCode, 409);
});

test("confirmed delayed VTU success records provider cost margin once", async (context) => {
  const pendingRecord = {
    _id: "vtu-success",
    userId: "user-id",
    reference: "VTU-SUCCESS",
    type: "airtime",
    amount: 100,
    providerCost: 90,
    balanceBefore: 500,
    status: "pending",
  };
  let transactionStatus = "pending";
  const companyWallet = {
    balance: 20,
    totalRevenue: 20,
    totalVTUProfit: 0,
    save: async () => {},
  };
  let attemptWrites = 0;
  let notifications = 0;
  let audits = 0;

  context.mock.method(mongoose, "startSession", async () => ({
    active: false,
    startTransaction() { this.active = true; },
    inTransaction() { return this.active; },
    async commitTransaction() { this.active = false; },
    async abortTransaction() { this.active = false; },
    async endSession() {},
  }));
  context.mock.method(Transaction, "findOne", () => ({ session: async () => transactionStatus === "pending" ? pendingRecord : null }));
  context.mock.method(Transaction, "findOneAndUpdate", async (_filter, update) => {
    if (transactionStatus !== "pending") return null;
    transactionStatus = "success";
    return { ...pendingRecord, ...update.$set, status: "success" };
  });
  context.mock.method(CompanyWallet, "findOne", () => ({ session: async () => companyWallet }));
  context.mock.method(CompanyWallet.prototype, "save", async function saveWallet() {
    this.balance += 10;
    this.totalRevenue += 10;
    this.totalVTUProfit += 10;
  });
  context.mock.method(ReconciliationAttempt, "create", async () => { attemptWrites += 1; });
  context.mock.method(Notification, "create", async () => { notifications += 1; return {}; });
  context.mock.method(FinancialAuditLog, "create", async () => { audits += 1; });

  const result = await settlePendingTransaction({
    transactionId: "vtu-success",
    provider: "peyflex",
    finalStatus: "success",
    observedStatus: "MANUAL_PROVIDER_PORTAL",
    mode: "manual",
    reason: "verified support ticket",
    providerCost: 90,
    providerFee: 0,
  });

  assert.equal(result.result, "resolved");
  assert.equal(transactionStatus, "success");
  assert.equal(result.transaction.pricingSnapshot.providerChargeStatus, "reconciled_actual");
  assert.equal(companyWallet.balance, 30);
  assert.equal(companyWallet.totalVTUProfit, 10);
  assert.equal(attemptWrites, 1);
  assert.equal(notifications, 1);
  assert.equal(audits, 1);
});

test("VTU success cannot be recorded from configured estimates without confirmed charges", async (context) => {
  let updateCalls = 0;
  let aborted = 0;
  context.mock.method(mongoose, "startSession", async () => ({
    startTransaction() {},
    inTransaction: () => true,
    async commitTransaction() {},
    async abortTransaction() { aborted += 1; },
    async endSession() {},
  }));
  context.mock.method(Transaction, "findOne", () => ({
    session: async () => ({
      _id: "pending-vtu",
      userId: "user-id",
      type: "airtime",
      amount: 100,
      providerCost: 90,
      providerFee: 0,
      status: "pending",
    }),
  }));
  context.mock.method(Transaction, "findOneAndUpdate", async () => { updateCalls += 1; });

  await assert.rejects(
    settlePendingTransaction({
      transactionId: "pending-vtu",
      provider: "peyflex",
      finalStatus: "success",
      mode: "manual",
      reason: "provider success",
    }),
    /Confirmed provider cost and fee are required/
  );
  assert.equal(updateCalls, 0);
  assert.equal(aborted, 1);
});

test("manual reconciliation notes reject secrets and payload-like data", () => {
  assert.equal(isSafeReconciliationNote("support-case-4921", "Provider portal confirms transaction failed"), true);
  assert.equal(isSafeReconciliationNote("support-case-4921", "Bearer secret-value"), false);
  assert.equal(isSafeReconciliationNote("ticket-1", '{"provider":"response"}'), false);
  assert.equal(isSafeReconciliationNote("", "no evidence"), false);
});

test("delayed airtime success books a negative retail margin instead of dropping the loss", async (context) => {
  const pendingRecord = {
    _id: "airtime-loss",
    userId: "user-id",
    reference: "AIR-LOSS",
    type: "airtime",
    amount: 99,
    providerCost: 100,
    balanceBefore: 500,
    status: "pending",
  };
  let transactionStatus = "pending";
  const companyWallet = {
    balance: 10,
    totalRevenue: 10,
    totalVTUProfit: 0,
    async save() {},
  };
  context.mock.method(mongoose, "startSession", async () => ({
    active: false,
    startTransaction() { this.active = true; },
    inTransaction() { return this.active; },
    async commitTransaction() { this.active = false; },
    async abortTransaction() { this.active = false; },
    async endSession() {},
  }));
  context.mock.method(Transaction, "findOne", () => ({ session: async () => transactionStatus === "pending" ? pendingRecord : null }));
  context.mock.method(Transaction, "findOneAndUpdate", async (_filter, update) => {
    if (transactionStatus !== "pending") return null;
    transactionStatus = "success";
    return { ...pendingRecord, ...update.$set, status: "success" };
  });
  context.mock.method(CompanyWallet, "findOne", () => ({ session: async () => companyWallet }));
  context.mock.method(ReconciliationAttempt, "create", async () => {});
  context.mock.method(Notification, "create", async () => ({}));
  context.mock.method(FinancialAuditLog, "create", async () => {});

  await settlePendingTransaction({
    transactionId: "airtime-loss",
    provider: "peyflex",
    finalStatus: "success",
    mode: "manual",
    reason: "verified portal success",
    providerCost: 100,
    providerFee: 0,
  });

  assert.equal(companyWallet.balance, 9);
  assert.equal(companyWallet.totalRevenue, 9);
  assert.equal(companyWallet.totalVTUProfit, -1);
});

test("changing a transaction PIN requires the existing PIN and retains lockout", async (context) => {
  const user = {
    pin: "old-hash",
    pinAttempts: 0,
    pinLockedUntil: null,
    async save() {},
  };
  context.mock.method(User, "findById", async () => user);
  context.mock.method(bcrypt, "compare", async (enteredPin, savedPin) =>
    enteredPin === "1234" && savedPin === "old-hash"
  );
  context.mock.method(bcrypt, "hash", async (pin) => `hashed-${pin}`);

  const createResponse = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });

  const missingCurrentPin = createResponse();
  await setPin(
    { body: { pin: "5678" }, user: { id: "user-id" } },
    missingCurrentPin
  );
  assert.equal(missingCurrentPin.statusCode, 400);
  assert.equal(user.pin, "old-hash");
  assert.equal(user.pinAttempts, 1);

  const verifiedCurrentPin = createResponse();
  await setPin(
    { body: { pin: "5678", currentPin: "1234" }, user: { id: "user-id" } },
    verifiedCurrentPin
  );
  assert.equal(verifiedCurrentPin.statusCode, 200);
  assert.equal(user.pin, "hashed-5678");
  assert.equal(user.pinAttempts, 0);
});

test("changing an Admin PIN requires the existing Admin PIN and retains lockout", async (context) => {
  const admin = {
    role: "admin",
    adminPin: "old-admin-hash",
    adminPinAttempts: 0,
    adminPinLockedUntil: null,
    async save() {},
  };
  context.mock.method(User, "findById", async () => admin);
  context.mock.method(bcrypt, "compare", async (enteredPin, savedPin) =>
    enteredPin === "1234" && savedPin === "old-admin-hash"
  );
  context.mock.method(bcrypt, "hash", async (pin) => `hashed-${pin}`);

  const createResponse = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });

  const missingCurrentPin = createResponse();
  await setAdminPin(
    { body: { pin: "5678" }, user: { id: "admin-id", role: "admin" } },
    missingCurrentPin
  );
  assert.equal(missingCurrentPin.statusCode, 400);
  assert.equal(admin.adminPin, "old-admin-hash");
  assert.equal(admin.adminPinAttempts, 1);

  const verifiedCurrentPin = createResponse();
  await setAdminPin(
    { body: { pin: "5678", currentPin: "1234" }, user: { id: "admin-id", role: "admin" } },
    verifiedCurrentPin
  );
  assert.equal(verifiedCurrentPin.statusCode, 200);
  assert.equal(admin.adminPin, "hashed-5678");
  assert.equal(admin.adminPinAttempts, 0);
});

test("initial PIN setup remains available when no PIN exists", async (context) => {
  const user = {
    pin: null,
    pinAttempts: 0,
    pinLockedUntil: null,
    async save() {},
  };
  context.mock.method(User, "findById", async () => user);
  context.mock.method(bcrypt, "hash", async (pin) => `hashed-${pin}`);
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await setPin({ body: { pin: "5678" }, user: { id: "user-id" } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(user.pin, "hashed-5678");
});

test("Admin PIN lockout still applies to protected admin actions", async (context) => {
  const admin = {
    adminPin: "admin-hash",
    adminPinAttempts: 0,
    adminPinLockedUntil: null,
    async save() {},
  };
  context.mock.method(User, "findById", async () => admin);
  context.mock.method(bcrypt, "compare", async () => false);
  const req = { body: { adminPin: "0000" }, user: { id: "admin-id" } };
  const next = () => assert.fail("A failed Admin PIN must not authorize the action");
  const responses = [];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await requireAdminPin(req, response, next);
    responses.push(response);
  }

  assert.deepEqual(responses.map((response) => response.statusCode), [400, 400, 400, 403]);
  assert.ok(admin.adminPinLockedUntil > Date.now());
});

test("profile reports PIN setup flags without returning stored PIN hashes", async (context) => {
  context.mock.method(Settings, "findOne", async () => ({
    welcomeBonus: 100,
    welcomeBonusEnabled: false,
    welcomeBonusEnabledAt: null,
  }));
  context.mock.method(User, "findById", async () => ({
    fullName: "Test Admin",
    username: "test-admin",
    email: "admin@example.test",
    phone: "0000000000",
    role: "admin",
    pin: "transaction-hash",
    adminPin: "admin-hash",
    walletBalance: 0,
    bonusBalance: 0,
  }));
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await getProfile({ user: { id: "admin-id" } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.hasTransactionPin, true);
  assert.equal(response.body.hasAdminPin, true);
  assert.equal("pin" in response.body, false);
  assert.equal("adminPin" in response.body, false);
});

test("internal wallet transfers reject non-finite amounts before ledger work", async (context) => {
  const createSession = () => {
    let active = false;
    return {
      startTransaction() { active = true; },
      inTransaction() { return active; },
      async abortTransaction() { active = false; },
      async commitTransaction() { active = false; },
      endSession() {},
    };
  };
  context.mock.method(mongoose, "startSession", async () => createSession());
  context.mock.method(User, "findById", () => {
    assert.fail("Invalid amounts must be rejected before loading or changing a user wallet");
  });

  const createResponse = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });

  const requests = [
    [sendMoney, { user: { id: "user-id" }, body: { phone: "0000000000", amount: "Infinity" } }],
  ];

  for (const [handler, req] of requests) {
    const response = createResponse();
    await handler(req, response);
    assert.equal(response.statusCode, 400);
  }
});

test("P2P transfer idempotency blocks a replay before the controller runs", async (context) => {
  const key = "wallet-transfer-replay-0001";
  const body = { phone: "08012345678", amount: 125, pin: "1234", narration: "Lunch" };
  const fingerprint = createPurchaseFingerprint("wallet_transfer", {
    phone: body.phone,
    amount: body.amount,
    narration: body.narration,
  });
  let existing = null;
  context.mock.method(Transaction, "findOne", () => ({
    sort() { return this; },
    select: async () => existing,
  }));
  const middleware = requirePurchaseIdempotency("wallet_transfer");
  const createRequest = () => ({
    user: { id: "sender-id" },
    body: { ...body },
    get: (header) => header === "Idempotency-Key" ? key : undefined,
  });
  const createResponse = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(bodyValue) { this.body = bodyValue; return this; },
  });

  const firstRequest = createRequest();
  let firstNextCalled = false;
  await middleware(firstRequest, createResponse(), () => { firstNextCalled = true; });
  assert.equal(firstNextCalled, true);
  assert.deepEqual(firstRequest.purchaseIdempotency, { key, fingerprint });

  existing = { requestFingerprint: fingerprint, status: "success", reference: "existing-transfer" };
  let replayNextCalled = false;
  const replayResponse = createResponse();
  await middleware(createRequest(), replayResponse, () => { replayNextCalled = true; });
  assert.equal(replayNextCalled, false);
  assert.equal(replayResponse.statusCode, 200);
  assert.equal(replayResponse.body.reference, "existing-transfer");

  existing = { requestFingerprint: "different-fingerprint", status: "success", reference: "existing-transfer" };
  const conflictResponse = createResponse();
  await middleware(createRequest(), conflictResponse, () => assert.fail("Changed payload must not reach the transfer controller"));
  assert.equal(conflictResponse.statusCode, 409);
});