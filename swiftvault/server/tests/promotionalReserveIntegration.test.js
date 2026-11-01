import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import AdminActivityLog from "../models/AdminActivityLog.js";
import FinancialJournal from "../models/FinancialJournal.js";
import PromotionalReserve from "../models/PromotionalReserve.js";
import Settings from "../models/Settings.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import adminRouter from "../routes/adminRoutes.js";
import { adminOnly } from "../middleware/admin.js";
import { requireAdminPin } from "../middleware/requireAdminPin.js";
import {
  getPromotionalReserve,
  fundPromotionalReserve,
  updateWelcomeBonusStatus,
} from "../controllers/promotionalReserveController.js";
import { invalidateSettingsCache } from "../services/settingsService.js";
import { FINANCIAL_ACCOUNTS } from "../services/financialLedgerService.js";

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const aggregateResult = (rows) => ({
  session() { return this; },
  then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); },
});

const newSession = () => {
  let active = false;
  return {
    inTransaction: () => active,
    startTransaction: () => { active = true; },
    commitTransaction: async () => { active = false; },
    abortTransaction: async () => { active = false; },
    endSession: async () => {},
  };
};

const reserveRoutes = () => adminRouter.stack
  .filter((layer) => layer.route && String(layer.route.path).includes("promotional-reserve"))
  .map((layer) => ({
    path: layer.route.path,
    handlers: layer.route.stack.map((item) => item.name),
  }));

test("promotional reserve routes require admin authorization and PIN for changes", () => {
  const globalMiddleware = adminRouter.stack
    .filter((layer) => !layer.route)
    .map((layer) => layer.name);
  assert.deepEqual(globalMiddleware.slice(0, 2), ["protect", "adminOnly"]);
  assert.deepEqual(reserveRoutes(), [
    { path: "/promotional-reserve", handlers: ["getPromotionalReserve"] },
    { path: "/promotional-reserve/fund", handlers: ["<anonymous>", "requireAdminPin", "fundPromotionalReserve"] },
    { path: "/promotional-reserve/welcome-bonus", handlers: ["<anonymous>", "requireAdminPin", "updateWelcomeBonusStatus"] },
  ]);

  let nextCalled = false;
  const denied = response();
  adminOnly({ user: { role: "user" } }, denied, () => { nextCalled = true; });
  assert.equal(denied.statusCode, 403);
  assert.equal(nextCalled, false);

  const missingPin = response();
  requireAdminPin({ body: {}, user: { id: "admin-id" } }, missingPin, () => { nextCalled = true; });
  return Promise.resolve().then(() => {
    assert.equal(missingPin.statusCode, 400);
    assert.equal(nextCalled, false);
  });
});

test("reserve funding is journaled, capped by bank ledger, idempotent and audited", async (context) => {
  let bankBalance = 500;
  let reserveUpdates = 0;
  let journalCreates = [];
  let activityEntries = [];
  let existingFundingJournal = null;
  const reserve = { key: "primary", fundedBalance: 0, availableBalance: 0, awardedTotal: 0 };
  const session = newSession();
  context.mock.method(mongoose, "startSession", async () => session);
  context.mock.method(FinancialJournal, "findOne", (filter) => ({
    select() { return this; },
    session: async () => filter.idempotencyKey === "promotional-reserve-funding:alloc-test-001"
      ? existingFundingJournal
      : null,
  }));
  context.mock.method(FinancialJournal, "create", async (documents) => {
    journalCreates.push(...documents);
    for (const journal of documents) {
      if (journal.category === "promotional_reserve_funding") {
        bankBalance -= Number(journal.lines.find((line) => line.account === FINANCIAL_ACCOUNTS.companyBank)?.credit || 0);
        existingFundingJournal = journal;
      }
    }
    return documents;
  });
  context.mock.method(FinancialJournal, "aggregate", (pipeline) => {
    const account = pipeline.find((stage) => stage.$match)?.$match?.["lines.account"];
    if (account === FINANCIAL_ACCOUNTS.companyBank) return aggregateResult([{ balance: bankBalance }]);
    if (account === FINANCIAL_ACCOUNTS.promotionalReserve) return aggregateResult([{ balance: 100 }]);
    return aggregateResult([]);
  });
  context.mock.method(FinancialJournal, "find", () => ({
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => [],
  }));
  context.mock.method(Transaction, "aggregate", async () => []);
  context.mock.method(User, "aggregate", async () => []);
  context.mock.method(PromotionalReserve, "findOne", () => ({ lean: async () => reserve }));
  context.mock.method(PromotionalReserve, "findOneAndUpdate", async (_filter, update) => {
    reserveUpdates += 1;
    reserve.fundedBalance += update.$inc.fundedBalance;
    reserve.availableBalance += update.$inc.availableBalance;
    return reserve;
  });
  context.mock.method(AdminActivityLog, "create", async (documents) => {
    activityEntries.push(...documents);
    return documents;
  });

  const req = {
    body: { amount: 100, reference: "alloc-test-001", evidenceReference: "statement-line-abc" },
    user: { _id: "admin-id", fullName: "Test Admin", username: "admin" },
    ip: "127.0.0.1",
    get: () => "test-agent",
  };
  const success = response();
  await fundPromotionalReserve(req, success);

  assert.equal(success.statusCode, 201);
  assert.equal(reserveUpdates, 1);
  assert.equal(journalCreates.length, 1);
  assert.equal(journalCreates[0].category, "promotional_reserve_funding");
  assert.equal(journalCreates[0].evidenceReference, "statement-line-abc");
  assert.deepEqual(
    journalCreates[0].lines.map(({ account, debit, credit }) => ({ account, debit, credit })),
    [
      { account: FINANCIAL_ACCOUNTS.promotionalReserve, debit: 100, credit: 0 },
      { account: FINANCIAL_ACCOUNTS.companyBank, debit: 0, credit: 100 },
    ],
  );
  assert.equal(activityEntries.length, 1);
  assert.equal(activityEntries[0].action, "promotional_reserve_funded");

  const replay = response();
  await fundPromotionalReserve(req, replay);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.created, false);
  assert.equal(reserveUpdates, 1);
  assert.equal(journalCreates.length, 1);
  assert.equal(activityEntries.length, 1);

  bankBalance = 0;
  const insufficient = response();
  await fundPromotionalReserve({
    ...req,
    body: { amount: 1, reference: "alloc-test-002", evidenceReference: "statement-line-def" },
  }, insufficient);
  assert.equal(insufficient.statusCode, 409);
  assert.equal(reserveUpdates, 1);
  assert.equal(journalCreates.length, 1);
  assert.equal(activityEntries.length, 1);
});

test("welcome bonus activation requires a reconciled, funded reserve and records admin activity", async (context) => {
  invalidateSettingsCache();
  context.after(invalidateSettingsCache);
  const settings = new Settings({
    welcomeBonus: 100,
    welcomeBonusEnabled: false,
    welcomeBonusEnabledAt: null,
  });
  let saveCount = 0;
  context.mock.method(Settings, "findOne", async () => settings);
  context.mock.method(settings, "save", async () => {
    saveCount += 1;
    return settings;
  });
  let reserveAvailable = 100;
  context.mock.method(PromotionalReserve, "findOne", () => ({
    lean: async () => ({ availableBalance: reserveAvailable, fundedBalance: 100, awardedTotal: 0 }),
  }));
  context.mock.method(Transaction, "aggregate", async () => []);
  context.mock.method(FinancialJournal, "aggregate", (pipeline) => {
    const account = pipeline.find((stage) => stage.$match)?.$match?.["lines.account"];
    const balance = account === FINANCIAL_ACCOUNTS.promotionalReserve ? 100 : 0;
    return aggregateResult(balance ? [{ balance }] : []);
  });
  context.mock.method(User, "aggregate", async () => []);
  const activity = [];
  context.mock.method(AdminActivityLog, "create", async (documents) => {
    activity.push(...(Array.isArray(documents) ? documents : [documents]));
    return documents;
  });

  const req = { body: { enabled: true }, user: { _id: "admin-id", username: "admin" } };
  const enabled = response();
  await updateWelcomeBonusStatus(req, enabled);

  assert.equal(enabled.statusCode, 200);
  assert.equal(settings.welcomeBonusEnabled, true);
  assert.ok(settings.welcomeBonusEnabledAt instanceof Date);
  assert.equal(saveCount, 1);
  assert.equal(activity[0].action, "welcome_bonus_enabled");

  reserveAvailable = 0;
  const denied = response();
  await updateWelcomeBonusStatus(req, denied);
  assert.equal(denied.statusCode, 409);
  assert.equal(saveCount, 1);
  assert.equal(activity.length, 1);
});

test("reserve reconciliation matches remaining asset and outstanding bonus liability", async (context) => {
  invalidateSettingsCache();
  context.after(invalidateSettingsCache);
  let userBonusBalance = 40;
  const reserve = { key: "primary", fundedBalance: 200, availableBalance: 100, awardedTotal: 100 };
  context.mock.method(PromotionalReserve, "findOne", () => ({ lean: async () => reserve }));
  context.mock.method(Transaction, "aggregate", async () => [{ awardedTotal: 100, awardCount: 1 }]);
  context.mock.method(FinancialJournal, "aggregate", (pipeline) => {
    const account = pipeline.find((stage) => stage.$match)?.$match?.["lines.account"];
    const balances = {
      [FINANCIAL_ACCOUNTS.promotionalReserve]: 100,
      [FINANCIAL_ACCOUNTS.customerBonusWallet]: 40,
      [FINANCIAL_ACCOUNTS.companyBank]: 300,
    };
    const balance = balances[account] || 0;
    return aggregateResult(balance ? [{ balance }] : []);
  });
  context.mock.method(User, "aggregate", async () => [{ balance: userBonusBalance }]);
  context.mock.method(Settings, "findOne", async () => new Settings({
    welcomeBonus: 100,
    welcomeBonusEnabled: true,
  }));
  context.mock.method(FinancialJournal, "find", () => ({
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => [],
  }));

  const reconciled = response();
  await getPromotionalReserve({}, reconciled);
  assert.equal(reconciled.statusCode, 200);
  assert.equal(reconciled.body.balances.expectedAvailableBalance, 100);
  assert.equal(reconciled.body.balances.reconciled, true);

  userBonusBalance = 39;
  const mismatch = response();
  await getPromotionalReserve({}, mismatch);
  assert.equal(mismatch.body.balances.reconciled, false);
});
