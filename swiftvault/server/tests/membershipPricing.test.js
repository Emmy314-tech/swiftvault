import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import CompanyWallet from "../models/CompanyWallet.js";
import Settings from "../models/Settings.js";
import Transaction from "../models/Transaction.js";
import FinancialJournal from "../models/FinancialJournal.js";
import User from "../models/User.js";
import FinancialAuditLog from "../models/FinancialAuditLog.js";
import { purchaseUpgrade } from "../controllers/upgradeController.js";
import {
  calculatePrice,
  resolveUpgradedPricingSchedule,
  validatePricingUpdate,
} from "../services/pricingService.js";
import {
  activateUserUpgrade,
  changeUserTier,
  getUpgradeAllocation,
  isEligibleUpgradeReferrer,
  UPGRADE_FEE,
} from "../services/membershipService.js";
import { assertPeyflexEndpointAvailable } from "../services/peyflexService.js";
import { invalidateSettingsCache } from "../services/settingsService.js";
import {
  calculateManagedProviderPrice,
  providerCostKey,
  validatePeyflexPricingUpdate,
} from "../services/providerPricingService.js";

let createdFinancialJournals = [];

test.beforeEach((context) => {
  createdFinancialJournals = [];
  context.mock.method(FinancialJournal, "findOne", () => ({
    select() { return this; },
    session: async () => null,
  }));
  context.mock.method(FinancialJournal, "create", async ([journal]) => {
    createdFinancialJournals.push(journal);
    return [journal];
  });
});

const pricing = {
  data: { normal: 44, retail: 24, wholesale: 9 },
  airtime: { normal: 1, retail: 0.995, wholesale: 0.99 },
  cable: { normal: 100, retail: 50, wholesale: 20 },
  electricity: { normal: 100, retail: 50, wholesale: 20 },
  educational: { normal: 200, retail: 90, wholesale: 30 },
  epin: { normalMultiplier: 1.01, retailMultiplier: 1.005, wholesaleMultiplier: 1 },
  upgraded: {
    configured: false,
    enabled: false,
    data: 20,
    airtime: 1,
    cable: 25,
    electricity: 25,
    educational: 30,
    epinMultiplier: 1,
  },
};

const setupUpgradePurchase = async (context, { referrer, walletBalance = 5000, upgradeFee = 3000 } = {}) => {
  invalidateSettingsCache();
  context.mock.method(Settings, "findOne", async () => ({ upgradeFee }));
  context.after(invalidateSettingsCache);
  const session = {
    active: false,
    committed: 0,
    aborted: 0,
    inTransaction() { return this.active; },
    startTransaction() { this.active = true; },
    async commitTransaction() { this.committed += 1; this.active = false; },
    async abortTransaction() { this.aborted += 1; this.active = false; },
    async endSession() {},
  };
  const buyer = {
    _id: new mongoose.Types.ObjectId(),
    role: "user",
    tier: "wholesale",
    isUpgraded: false,
    walletBalance,
    pin: bcrypt.hashSync("1234", 4),
    referredBy: referrer ? "REFERRAL" : null,
    username: "buyer",
    async save() {},
  };
  const sponsor = referrer && {
    _id: new mongoose.Types.ObjectId(),
    username: "sponsor",
    walletBalance: 200,
    isUpgraded: referrer.isUpgraded,
    tier: referrer.tier || "normal",
    async save() {},
  };
  const companyWallet = {
    balance: 50,
    totalRevenue: 50,
    totalUpgradeRevenue: 0,
    async save() { return this; },
  };
  const transactions = [];
  const auditEntries = [];

  context.mock.method(mongoose, "startSession", async () => session);
  context.mock.method(User, "findById", () => ({ session: async () => buyer }));
  context.mock.method(User, "findOne", () => ({ session: async () => sponsor }));
  context.mock.method(CompanyWallet, "findOne", () => ({ session: async () => companyWallet }));
  context.mock.method(Transaction, "create", async (documents) => {
    const created = documents.map((document) => ({ ...document, _id: new mongoose.Types.ObjectId() }));
    transactions.push(...created);
    return created;
  });
  context.mock.method(FinancialAuditLog, "create", async (documents, options) => {
    assert.equal(options.session, session);
    auditEntries.push(...documents);
  });

  const response = {
    statusCode: 200,
    body: null,
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
  };
  const request = {
    user: { id: buyer._id },
    body: { pin: "1234", success: true, status: "success", amount: 1, isUpgraded: false, referralCommission: 999999 },
    purchaseIdempotency: { key: "test-idempotency-key", fingerprint: "test-fingerprint" },
    ip: "127.0.0.1",
  };
  await purchaseUpgrade(request, response);

  return { buyer, sponsor, companyWallet, transactions, auditEntries, response, session, request };
};

test("tier changes do not change normal VTU prices or upgrade status", () => {
  const user = { tier: "normal", isUpgraded: false, walletBalance: 7000 };
  const before = calculatePrice({ pricing, serviceType: "data", baseCost: 100, ...user });

  changeUserTier(user, "wholesale");

  assert.equal(user.isUpgraded, false);
  assert.equal(user.walletBalance, 7000);
  assert.equal(calculatePrice({ pricing, serviceType: "data", baseCost: 100, ...user }), before);
});

test("activating paid upgrade does not change tier", () => {
  const user = { tier: "retail", isUpgraded: false };
  activateUserUpgrade(user, new Date("2026-01-01T00:00:00Z"));

  assert.equal(user.tier, "retail");
  assert.equal(user.isUpgraded, true);
  assert.equal(user.upgradedAt.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("upgraded users keep normal prices until separate upgraded pricing is enabled", () => {
  const normalPrice = calculatePrice({ pricing, serviceType: "data", baseCost: 100, isUpgraded: false });
  const inactiveSchedulePrice = calculatePrice({ pricing, serviceType: "data", baseCost: 100, isUpgraded: true });
  assert.equal(inactiveSchedulePrice, normalPrice);

  const unconfiguredEnabledPricing = { ...pricing, upgraded: { ...pricing.upgraded, enabled: true } };
  assert.equal(calculatePrice({ pricing: unconfiguredEnabledPricing, serviceType: "data", baseCost: 100, isUpgraded: true }), normalPrice);

  const activePricing = { ...pricing, upgraded: { ...pricing.upgraded, configured: true, enabled: true } };
  assert.equal(calculatePrice({ pricing: activePricing, serviceType: "data", baseCost: 100, isUpgraded: true }), 120);
  assert.equal(calculatePrice({ pricing: activePricing, serviceType: "data", baseCost: 100, isUpgraded: false }), normalPrice);
});

test("client-supplied tier and upgrade flags cannot select a pricing schedule", () => {
  const normal = calculatePrice({
    pricing,
    serviceType: "airtime",
    baseCost: 100,
    tier: "wholesale",
    requestedIsUpgraded: true,
    isUpgraded: false,
  });
  assert.equal(normal, 100);
});

const managedPeyflexSettings = ({
  providerCost = 90,
  providerFee = 2,
  validUntil = "2099-01-01T00:00:00.000Z",
  entitlement = "unknown",
  pricingOverride = {},
} = {}) => ({
  pricing: {
    ...pricing,
    upgraded: { ...pricing.upgraded, configured: true, enabled: true, data: 10 },
    ...pricingOverride,
  },
  peyflexPricing: {
    providerEntitlement: { status: entitlement },
    costEntries: [{
      service: "data",
      provider: "mtn",
      product: "plan-1",
      providerCost,
      providerFee,
      validUntil: new Date(validUntil),
      evidenceReference: "provider-invoice-2026-01",
    }],
  },
});

test("admin-managed provider costs drive normal and upgraded selling prices", () => {
  const settings = managedPeyflexSettings();
  const normal = calculateManagedProviderPrice({
    settings,
    service: "data",
    provider: "MTN",
    product: "PLAN-1",
    user: { tier: "wholesale", isUpgraded: false },
  });
  const upgraded = calculateManagedProviderPrice({
    settings,
    service: "data",
    provider: "mtn",
    product: "plan-1",
    user: { tier: "normal", isUpgraded: true },
  });

  assert.equal(normal.providerCost, 90);
  assert.equal(normal.providerFee, 2);
  assert.equal(normal.sellingPrice, 136);
  assert.equal(normal.pricingSnapshot.normalSellingPrice, 136);
  assert.equal(upgraded.sellingPrice, 102);
  assert.equal(upgraded.pricingSnapshot.appliedSchedule, "upgraded");
  assert.equal(providerCostKey({ service: "data", provider: "MTN", product: "PLAN-1" }), "data|mtn|plan-1");
});

test("provider-cost changes alter the price and margin snapshot without inferring discount entitlement", () => {
  const standard = calculateManagedProviderPrice({
    settings: managedPeyflexSettings({ providerCost: 90, entitlement: "standard_api_discount" }),
    service: "data",
    provider: "mtn",
    product: "plan-1",
    user: {},
  });
  const topReseller = calculateManagedProviderPrice({
    settings: managedPeyflexSettings({ providerCost: 95, entitlement: "top_reseller" }),
    service: "data",
    provider: "mtn",
    product: "plan-1",
    user: {},
  });

  assert.equal(standard.sellingPrice, 136);
  assert.equal(standard.pricingSnapshot.estimatedGrossMargin, 44);
  assert.equal(standard.pricingSnapshot.providerChargeStatus, "configured_estimate");
  assert.equal(topReseller.sellingPrice, 141);
  assert.equal(topReseller.pricingSnapshot.estimatedGrossMargin, 44);
  assert.equal(topReseller.pricingSnapshot.providerEntitlement.status, "top_reseller");
});

test("missing and stale managed costs fail closed", () => {
  const settings = managedPeyflexSettings({ validUntil: "2020-01-01T00:00:00.000Z" });
  assert.throws(() => calculateManagedProviderPrice({
    settings,
    service: "data",
    provider: "mtn",
    product: "other-plan",
  }), /No admin-managed provider cost/);
  assert.throws(() => calculateManagedProviderPrice({
    settings,
    service: "data",
    provider: "mtn",
    product: "plan-1",
    now: new Date("2026-01-01T00:00:00.000Z"),
  }), /expired/);
});

test("provider pricing configuration validates evidence, expiry, and entitlement independently", () => {
  assert.doesNotThrow(() => validatePeyflexPricingUpdate({
    providerEntitlement: { status: "unknown" },
    costEntries: [{
      service: "airtime",
      provider: "mtn",
      product: "100",
      providerCost: 97,
      providerFee: 1,
      validUntil: "2099-01-01T00:00:00.000Z",
      evidenceReference: "invoice-123",
    }],
  }));
  assert.throws(() => validatePeyflexPricingUpdate({
    providerEntitlement: { status: "top_reseller" },
  }), /evidence reference/);
  assert.throws(() => validatePeyflexPricingUpdate({
    costEntries: [{
      service: "data",
      provider: "mtn",
      product: "plan-1",
      providerCost: 90,
      validUntil: "2020-01-01T00:00:00.000Z",
      evidenceReference: "invoice",
    }],
  }), /future validUntil/);
  assert.throws(() => validatePeyflexPricingUpdate({
    costEntries: [{
      service: "data",
      provider: "mtn",
      product: "plan-1",
      providerCost: 90,
      validUntil: "2099-01-01T00:00:00.000Z",
      evidenceReference: "api_token=secret",
    }],
  }), /safe evidence reference/);
});

test("pricing rejects below-cost schedules and ignores frontend price fields", () => {
  const safe = calculateManagedProviderPrice({
    settings: managedPeyflexSettings(),
    service: "data",
    provider: "mtn",
    product: "plan-1",
    user: { isUpgraded: false, clientPrice: 1, providerCost: 1 },
  });
  assert.equal(safe.sellingPrice, 136);
  assert.throws(() => calculateManagedProviderPrice({
    settings: managedPeyflexSettings({
      pricingOverride: { data: { normal: -100, retail: 24, wholesale: 9 } },
    }),
    service: "data",
    provider: "mtn",
    product: "plan-1",
    user: {},
  }), /lower than provider cost/);
});

test("upgrade allocation reconciles to ₦3,000 for every referrer state", () => {
  assert.equal(UPGRADE_FEE, 3000);
  assert.deepEqual(getUpgradeAllocation(false), { company: 3000, referrer: 0 });
  assert.deepEqual(getUpgradeAllocation(true), { company: 1500, referrer: 1500 });
  assert.equal(getUpgradeAllocation(false).company + getUpgradeAllocation(false).referrer, UPGRADE_FEE);
  assert.equal(getUpgradeAllocation(true).company + getUpgradeAllocation(true).referrer, UPGRADE_FEE);
  assert.deepEqual(getUpgradeAllocation(true, 4000), { company: 2500, referrer: 1500 });
  assert.deepEqual(getUpgradeAllocation(false, 4000), { company: 4000, referrer: 0 });
  assert.throws(() => getUpgradeAllocation(true, 1499), /at least/);
});

test("referral eligibility depends only on persisted upgrade status", () => {
  assert.equal(isEligibleUpgradeReferrer({ tier: "wholesale", isUpgraded: false }), false);
  assert.equal(isEligibleUpgradeReferrer({ tier: "normal", isUpgraded: true }), true);
  assert.equal(isEligibleUpgradeReferrer({ tier: "retail" }), false);
  assert.equal(isEligibleUpgradeReferrer(null), false);
});

test("upgrade pricing settings reject inactive tiers and prices below known provider cost", () => {
  assert.throws(() => validatePricingUpdate({ data: { wholesale: 1 } }), /Unsupported data pricing setting/);
  assert.throws(() => validatePricingUpdate({ airtime: { normal: 0.99 } }), /no lower than 1/);
  assert.throws(() => validatePricingUpdate({ upgraded: { airtime: 0.95 } }), /no lower than 1/);
  assert.throws(() => validatePricingUpdate({ upgraded: { enabled: "true" } }), /must be a boolean/);
  assert.doesNotThrow(() => validatePricingUpdate({
    data: { normal: 10 },
    upgraded: { enabled: true, data: 5, airtime: 1, epinMultiplier: 1 },
  }));
});

test("upgraded pricing cannot be enabled until a complete separate schedule is configured", () => {
  assert.throws(
    () => resolveUpgradedPricingSchedule(false, { enabled: true, data: 10 }),
    /complete upgraded pricing schedule/
  );
  const configured = resolveUpgradedPricingSchedule(false, {
    enabled: true,
    data: 10,
    airtime: 1,
    cable: 10,
    electricity: 10,
    educational: 10,
    epinMultiplier: 1,
  });
  assert.equal(configured.configured, true);
  assert.equal(configured.enabled, true);
  assert.equal(resolveUpgradedPricingSchedule(true, { enabled: true }).configured, true);
});

test("paid upgrade transactions have per-user and reference uniqueness constraints", () => {
  const indexes = Transaction.schema.indexes();
  const userIndex = indexes.find(([, options]) => options.name === "unique_paid_upgrade_per_user");
  const referenceIndex = indexes.find(([, options]) => options.name === "unique_upgrade_payment_reference");

  assert.equal(userIndex[1].unique, true);
  assert.deepEqual(userIndex[0], { userId: 1 });
  assert.equal(referenceIndex[1].unique, true);
  assert.deepEqual(referenceIndex[0], { reference: 1 });
});

test("ePIN remains blocked rather than using an undocumented purchase payload", () => {
    assert.throws(
      () => assertPeyflexEndpointAvailable("epin.purchase"),
      { code: "PEYFLEX_CONTRACT_UNVERIFIED" }
    );
  });

  test("upgrade payment without a referrer credits all ₦3,000 to the company", async (context) => {
    const result = await setupUpgradePurchase(context);

    assert.equal(result.response.statusCode, 200);
    assert.equal(result.buyer.walletBalance, 2000);
    assert.equal(result.buyer.isUpgraded, true);
    assert.equal(result.buyer.tier, "wholesale");
    assert.equal(result.companyWallet.balance, 3050);
    assert.equal(result.companyWallet.totalUpgradeRevenue, 3000);
    assert.equal(result.transactions.length, 1);
    assert.equal(result.transactions[0].amount, 3000);
    assert.deepEqual(result.transactions[0].upgradeAllocation, {
      company: 3000,
      referrer: 0,
      referrerUserId: null,
    });
    assert.equal(result.auditEntries.find((entry) => entry.operationType === "upgrade_company_allocation").amount, 3000);
    assert.equal(result.session.committed, 1);
  });

  test("upgrade payment with an unupgraded referrer pays no referral reward", async (context) => {
    const result = await setupUpgradePurchase(context, { referrer: { isUpgraded: false } });

    assert.equal(result.companyWallet.totalUpgradeRevenue, 3000);
    assert.equal(result.sponsor.walletBalance, 200);
    assert.equal(result.transactions.length, 1);
    assert.equal(result.transactions[0].upgradeAllocation.referrer, 0);
    assert.equal(result.auditEntries.some((entry) => entry.operationType === "referral_commission"), false);
  });

  test("upgrade payment with an upgraded referrer splits company and referral allocations", async (context) => {
    const result = await setupUpgradePurchase(context, { referrer: { isUpgraded: true } });

    assert.equal(result.companyWallet.totalUpgradeRevenue, 1500);
    assert.equal(result.sponsor.walletBalance, 1700);
    assert.equal(result.transactions.length, 2);
    assert.equal(result.transactions[0].upgradeAllocation.company, 1500);
    assert.equal(result.transactions[0].upgradeAllocation.referrer, 1500);
    assert.equal(result.transactions[1].type, "referral_upgrade_bonus");
    assert.equal(result.transactions[1].amount, 1500);
    assert.equal(result.transactions[1].idempotencyKey, `referral-bonus:${result.transactions[0]._id}`);
    const referralJournal = createdFinancialJournals.find((journal) => journal.category === "referral_bonus");
    assert.ok(referralJournal);
    assert.equal(String(referralJournal.sourceTransactionId), String(result.transactions[0]._id));
    assert.equal(String(referralJournal.userId), String(result.sponsor._id));
    assert.equal(String(referralJournal.counterpartyUserId), String(result.buyer._id));
    assert.equal(referralJournal.lines[0].account, "expenses:referral_bonus");
    assert.equal(referralJournal.lines[1].account, "liabilities:customer_wallet");
    assert.equal(result.auditEntries.find((entry) => entry.operationType === "upgrade_company_allocation").amount, 1500);
    assert.equal(result.auditEntries.find((entry) => entry.operationType === "referral_commission").amount, 1500);
  });

  test("a client-supplied success flag cannot bypass the wallet-funded upgrade fee", async (context) => {
    const result = await setupUpgradePurchase(context, { walletBalance: 2999 });

    assert.equal(result.response.statusCode, 400);
    assert.equal(result.buyer.isUpgraded, false);
    assert.equal(result.buyer.tier, "wholesale");
    assert.equal(result.buyer.walletBalance, 2999);
    assert.equal(result.transactions.length, 0);
    assert.equal(result.auditEntries.length, 0);
    assert.equal(result.session.committed, 0);
    assert.equal(result.session.aborted, 1);
  });

  test("an authorized upgrade-fee configuration is applied without changing tier", async (context) => {
    const result = await setupUpgradePurchase(context, { walletBalance: 5000, upgradeFee: 4000 });

    assert.equal(result.response.statusCode, 200);
    assert.equal(result.buyer.walletBalance, 1000);
    assert.equal(result.buyer.tier, "wholesale");
    assert.equal(result.transactions[0].amount, 4000);
    assert.equal(result.companyWallet.balance, 4050);
    assert.equal(result.transactions[0].upgradeAllocation.company, 4000);
  });

  test("repeating a confirmed upgrade cannot create a second payment or reward", async (context) => {
    const result = await setupUpgradePurchase(context, { referrer: { isUpgraded: true } });
    const repeatedResponse = {
      statusCode: 200,
      body: null,
      status(statusCode) { this.statusCode = statusCode; return this; },
      json(body) { this.body = body; return this; },
    };

    await purchaseUpgrade(result.request, repeatedResponse);

    assert.equal(repeatedResponse.statusCode, 409);
    assert.equal(result.transactions.length, 2);
    assert.equal(result.buyer.walletBalance, 2000);
    assert.equal(result.sponsor.walletBalance, 1700);
    assert.equal(result.session.aborted, 1);
});
