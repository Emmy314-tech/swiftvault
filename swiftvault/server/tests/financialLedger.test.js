import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import FinancialJournal from "../models/FinancialJournal.js";
import AdminActivityLog from "../models/AdminActivityLog.js";
import FinancialLedgerBackfillIssue from "../models/FinancialLedgerBackfillIssue.js";
import FinancialLedgerControl from "../models/FinancialLedgerControl.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import {
  exportFinancialLedger,
  getWalletReconciliation,
  parseLedgerFilter,
  recordProviderCommission,
  settleProviderCommission,
} from "../controllers/financialLedgerController.js";
import {
  FINANCIAL_ACCOUNTS,
  postFinancialJournal,
  reverseFinancialJournal,
} from "../services/financialLedgerService.js";

const activeSession = () => ({ inTransaction: () => true });

const makeJournal = (overrides = {}) => ({
  idempotencyKey: "referral-bonus:upgrade-1",
  sourceType: "membership_referral_bonus",
  sourceId: "upgrade-1",
  sourceReference: "UPG-1",
  sourceTransactionId: new mongoose.Types.ObjectId(),
  category: "referral_bonus",
  description: "Referral bonus credited to customer wallet.",
  occurredAt: new Date("2026-10-01T12:00:00.000Z"),
  userId: new mongoose.Types.ObjectId(),
  counterpartyUserId: new mongoose.Types.ObjectId(),
  lines: [
    { account: FINANCIAL_ACCOUNTS.referralExpense, debit: 1500, credit: 0 },
    { account: FINANCIAL_ACCOUNTS.customerWallet, debit: 0, credit: 1500 },
  ],
  ...overrides,
});

const mockJournalStore = (context, rows = new Map()) => {
  context.mock.method(FinancialJournal, "findOne", (filter) => ({
    select() { return this; },
    session: async () => rows.get(filter.idempotencyKey) || null,
  }));
  context.mock.method(FinancialJournal, "create", async ([journal]) => {
    if (rows.has(journal.idempotencyKey) ||
      (journal.settlesJournal && [...rows.values()].some((row) =>
        String(row.settlesJournal || "") === String(journal.settlesJournal)
      ))) {
      const error = new Error("Duplicate financial journal idempotency key.");
      error.code = 11000;
      throw error;
    }
    journal._id ||= new mongoose.Types.ObjectId();
    rows.set(journal.idempotencyKey, journal);
    return [journal];
  });
  return rows;
};

test("financial journal and referral source indexes prevent duplicate records", () => {
  const journalIndexes = FinancialJournal.schema.indexes();
  assert.ok(journalIndexes.some(([keys, options]) =>
    options.unique === true && keys.idempotencyKey === 1
  ));
  assert.ok(journalIndexes.some(([keys, options]) =>
    options.name === "unique_financial_journal_reversal" &&
    options.unique === true &&
    keys.reversalOf === 1
  ));
  assert.ok(journalIndexes.some(([keys, options]) =>
    options.name === "unique_provider_commission_settlement" &&
    options.unique === true &&
    keys.settlesJournal === 1
  ));

  const referralIndex = Transaction.schema.indexes().find(([, options]) =>
    options.name === "unique_referral_bonus_source"
  );
  assert.ok(referralIndex);
  assert.equal(referralIndex[1].unique, true);
  assert.deepEqual(referralIndex[0], { reference: 1 });
});

test("referral bonus is idempotent, balanced, and records referrer and referred user", async (context) => {
  const rows = mockJournalStore(context);
  const journalData = makeJournal();
  const session = activeSession();

  const first = await postFinancialJournal({ ...journalData, session });
  const duplicate = await postFinancialJournal({ ...journalData, session });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(rows.size, 1);
  assert.equal(String(first.journal.userId), String(journalData.userId));
  assert.equal(String(first.journal.counterpartyUserId), String(journalData.counterpartyUserId));
  assert.equal(String(first.journal.sourceTransactionId), String(journalData.sourceTransactionId));
  assert.deepEqual(
    first.journal.lines.map(({ account, debit, credit }) => ({ account, debit, credit })),
    [
      { account: FINANCIAL_ACCOUNTS.referralExpense, debit: 1500, credit: 0 },
      { account: FINANCIAL_ACCOUNTS.customerWallet, debit: 0, credit: 1500 },
    ]
  );
});

test("idempotency fingerprint rejects changed source transaction but retains original timestamp on replay", async (context) => {
  const rows = mockJournalStore(context);
  const journalData = makeJournal();
  const session = activeSession();
  await postFinancialJournal({ ...journalData, session });

  await assert.rejects(
    postFinancialJournal({
      ...journalData,
      sourceTransactionId: new mongoose.Types.ObjectId(),
      session,
    }),
    /idempotency key was reused with different accounting data/
  );
  const replay = await postFinancialJournal({
    ...journalData,
    occurredAt: new Date("2026-10-02T12:00:00.000Z"),
    session,
  });
  assert.equal(replay.created, false);
  assert.equal(replay.journal.occurredAt.toISOString(), "2026-10-01T12:00:00.000Z");
  assert.equal(rows.size, 1);
});

test("concurrent posts with the same key create at most one journal", async (context) => {
  const rows = new Map();
  let reads = 0;
  let releaseReads;
  const bothRead = new Promise((resolve) => { releaseReads = resolve; });
  context.mock.method(FinancialJournal, "findOne", () => ({
    select() { return this; },
    session: async () => {
      reads += 1;
      if (reads === 2) releaseReads();
      await bothRead;
      return rows.get("referral-bonus:upgrade-1") || null;
    },
  }));
  context.mock.method(FinancialJournal, "create", async ([journal]) => {
    if (rows.has(journal.idempotencyKey)) {
      const error = new Error("Duplicate key.");
      error.code = 11000;
      throw error;
    }
    rows.set(journal.idempotencyKey, journal);
    return [journal];
  });

  const journalData = makeJournal();
  const attempts = await Promise.allSettled([
    postFinancialJournal({ ...journalData, session: activeSession() }),
    postFinancialJournal({ ...journalData, session: activeSession() }),
  ]);

  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);
  assert.equal(rows.size, 1);
});

test("refund reversal swaps the original debit and credit without rewriting history", async (context) => {
  const originalId = new mongoose.Types.ObjectId();
  const original = {
    _id: originalId,
    idempotencyKey: "vtu-reserve:purchase-1",
    userId: new mongoose.Types.ObjectId(),
    counterpartyUserId: null,
    lines: [
      { account: FINANCIAL_ACCOUNTS.customerWallet, debit: 250, credit: 0, userId: originalId },
      { account: FINANCIAL_ACCOUNTS.pendingService, debit: 0, credit: 250, userId: null },
    ],
  };
  const rows = new Map([[original.idempotencyKey, original]]);
  mockJournalStore(context, rows);

  const result = await reverseFinancialJournal({
    originalIdempotencyKey: original.idempotencyKey,
    idempotencyKey: "vtu-refund:purchase-1",
    sourceType: "vtu_purchase_refund",
    sourceId: "purchase-1",
    sourceReference: "VTU-1",
    sourceTransactionId: new mongoose.Types.ObjectId(),
    category: "refund",
    description: "Failed VTU purchase refunded.",
    session: activeSession(),
  });

  assert.equal(result.created, true);
  assert.equal(String(result.journal.reversalOf), String(originalId));
  assert.deepEqual(
    result.journal.lines.map(({ account, debit, credit }) => ({ account, debit, credit })),
    [
      { account: FINANCIAL_ACCOUNTS.customerWallet, debit: 0, credit: 250 },
      { account: FINANCIAL_ACCOUNTS.pendingService, debit: 250, credit: 0 },
    ]
  );
  assert.equal(rows.get(original.idempotencyKey), original);
});

test("earned provider commissions use receivables and are settled to cash once", async (context) => {
  const rows = mockJournalStore(context);
  const session = () => {
    let inTransaction = false;
    return {
      startTransaction() { inTransaction = true; },
      inTransaction: () => inTransaction,
      async commitTransaction() { inTransaction = false; },
      async abortTransaction() { inTransaction = false; },
      async endSession() {},
    };
  };
  context.mock.method(mongoose, "startSession", async () => session());
  context.mock.method(AdminActivityLog, "create", async () => []);
  const makeResponse = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });
  const req = {
    user: { _id: new mongoose.Types.ObjectId(), username: "admin" },
    ip: "127.0.0.1",
    get: () => "test",
    body: {
      amount: "250.50",
      reference: "PROVIDER-COM-1",
      description: "Confirmed provider commission",
      evidenceReference: "statement-row-18",
      settlementStatus: "success",
    },
  };
  const earnedResponse = makeResponse();
  await recordProviderCommission(req, earnedResponse);

  const commission = rows.get("provider-commission:PROVIDER-COM-1");
  assert.equal(earnedResponse.statusCode, 201);
  assert.equal(commission.lines[0].account, FINANCIAL_ACCOUNTS.providerReceivable);
  assert.equal(commission.lines[0].debit, 250.5);
  assert.equal(commission.lines[1].account, FINANCIAL_ACCOUNTS.providerCommissionRevenue);
  assert.equal(commission.lines[1].credit, 250.5);

  const settlementRequest = {
    ...req,
    body: {
      commissionReference: "PROVIDER-COM-1",
      settlementReference: "BANK-SETTLEMENT-1",
      evidenceReference: "bank-statement-row-54",
    },
  };
  const settlementResponse = makeResponse();
  await settleProviderCommission(settlementRequest, settlementResponse);

  const settlement = rows.get("provider-commission-settlement:BANK-SETTLEMENT-1");
  assert.equal(settlementResponse.statusCode, 201);
  assert.equal(String(settlement.settlesJournal), String(commission._id));
  assert.deepEqual(
    settlement.lines.map(({ account, debit, credit }) => ({ account, debit, credit })),
    [
      { account: FINANCIAL_ACCOUNTS.companyBank, debit: 250.5, credit: 0 },
      { account: FINANCIAL_ACCOUNTS.providerReceivable, debit: 0, credit: 250.5 },
    ]
  );

  const replayResponse = makeResponse();
  await settleProviderCommission(settlementRequest, replayResponse);
  assert.equal(replayResponse.statusCode, 200);
  assert.equal(replayResponse.body.created, false);
  assert.equal(rows.size, 2);

  const duplicateSettlementResponse = makeResponse();
  await settleProviderCommission({
    ...settlementRequest,
    body: { ...settlementRequest.body, settlementReference: "BANK-SETTLEMENT-2" },
  }, duplicateSettlementResponse);
  assert.equal(duplicateSettlementResponse.statusCode, 409);
  assert.equal(rows.size, 2);
});

test("wallet reconciliation compares stored balances with customer-liability subledgers", async (context) => {
  let pipeline;
  context.mock.method(User, "aggregate", async (value) => {
    pipeline = value;
    return [{
      summary: [{ userCount: 1, absoluteDifference: 12.5 }],
      sample: [{ userId: "user-1", walletDifference: 10, bonusDifference: 2.5 }],
    }];
  });

  const result = await getWalletReconciliation();
  assert.equal(result.userCount, 1);
  assert.equal(result.absoluteDifference, 12.5);
  assert.deepEqual(result.sample[0], {
    userId: "user-1",
    walletDifference: 10,
    bonusDifference: 2.5,
  });

  const differenceStage = pipeline.find((stage) => stage.$set?.walletDifference);
  assert.deepEqual(
    differenceStage.$set.walletDifference,
    { $round: [{ $subtract: [{ $ifNull: ["$walletBalance", 0] }, "$ledgerWallet.net"] }, 2] }
  );
  assert.deepEqual(
    differenceStage.$set.bonusDifference,
    { $round: [{ $subtract: [{ $ifNull: ["$bonusBalance", 0] }, "$ledgerBonus.net"] }, 2] }
  );
});

test("revenue account filter rejects unknown classes and export excludes customer principal", async (context) => {
  assert.deepEqual(parseLedgerFilter({ accountClass: "revenue" }), {
    "lines.account": { $regex: "^revenue:" },
  });
  assert.throws(() => parseLedgerFilter({ accountClass: "liabilities" }), /Unknown financial account class/);

  context.mock.method(FinancialLedgerControl, "findOne", () => ({
    lean: async () => ({ reportingStatus: "ready", unresolvedSourceCount: 0 }),
  }));
  context.mock.method(FinancialLedgerBackfillIssue, "exists", async () => null);
  context.mock.method(FinancialJournal, "find", (filter) => {
    assert.deepEqual(filter["lines.account"], { $regex: "^revenue:" });
    return {
      sort() { return this; },
      cursor: () => (async function* journalCursor() {
        yield {
          occurredAt: new Date("2026-10-01T12:00:00.000Z"),
          category: "service_revenue",
          sourceStatus: "success",
          sourceReference: "VTU-1",
          lines: [
            { account: FINANCIAL_ACCOUNTS.customerWallet, debit: 100, credit: 0 },
            { account: FINANCIAL_ACCOUNTS.serviceRevenue, debit: 0, credit: 100 },
          ],
        };
      }()),
    };
  });

  const output = [];
  const response = {
    status(code) { this.statusCode = code; return this; },
    setHeader() {},
    write(chunk) { output.push(chunk); },
    end() { this.ended = true; },
  };
  await exportFinancialLedger({ query: { accountClass: "revenue" } }, response);

  const csv = output.join("");
  assert.equal(response.statusCode, 200);
  assert.equal(response.ended, true);
  assert.match(csv, /revenue:customer_services/);
  assert.doesNotMatch(csv, /liabilities:customer_wallet/);
});
