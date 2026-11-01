import assert from "node:assert/strict";
import test from "node:test";
import { requireStepUp } from "../middleware/securityGuards.js";
import { protect } from "../middleware/authMiddleware.js";
import { STEP_UP_ACTIONS } from "../services/securityService.js";
import { authenticateTransactionPin } from "../services/pinService.js";
import { getFundingHoldReason } from "../services/kycPolicyService.js";
import { settleVerifiedPaystackDedicatedTransfer, settleVerifiedPaystackPayment } from "../services/paystackFundingService.js";
import {
  applyPaystackDedicatedAccountEvent,
  getUnconfiguredPaystackDvaKycCapabilities,
} from "../services/paystackDedicatedAccountService.js";
import { buildPaystackDvaReadiness } from "../services/paystackDvaReadinessService.js";
import { createPaystackDedicatedAccountController } from "../controllers/paystackDedicatedAccountController.js";
import { createWebhookLog } from "../services/webhookLogService.js";
import WebhookLog from "../models/WebhookLog.js";
import { classifyPeyflexResponse } from "../services/providerOutcome.js";
import StepUpGrant from "../models/StepUpGrant.js";
import { createPaystackWebhookHandler } from "../controllers/paystackFundingController.js";

const makePayment = () => ({
  reference: "SVP-test-reference",
  amount: 12500,
  currency: "NGN",
  status: "success",
  customer: { email: "customer@example.test" },
  metadata: { fundingId: "funding-id", customerId: "customer-id" },
});

test("Paystack DVA checks only identity capabilities required for the verified tier", () => {
  const capabilities = {
    bvn: "CONFIGURED",
    bvnDateOfBirthMatch: "CONFIGURED",
    bvnNameMatch: "UNCONFIGURED",
    nin: "UNCONFIGURED",
    ninIdentityMatch: "UNCONFIGURED",
    faceLiveness: "CONFIGURED",
  };

  assert.deepEqual(getUnconfiguredPaystackDvaKycCapabilities(1, capabilities), []);
  assert.deepEqual(
    getUnconfiguredPaystackDvaKycCapabilities(1, capabilities, {
      tier1BvnNameMatchRequired: true,
      tier1NinConsistencyRequired: true,
    }),
    ["bvnNameMatch", "nin"],
  );
  assert.deepEqual(
    getUnconfiguredPaystackDvaKycCapabilities(2, capabilities, {
      tier1BvnNameMatchRequired: false,
      tier1NinConsistencyRequired: false,
    }),
    ["nin", "ninIdentityMatch"],
  );
});

test("admin Paystack DVA readiness reports blockers without exposing credentials or identity data", () => {
  const readiness = buildPaystackDvaReadiness({
    credentials: { paystackSecretKey: { configured: true, source: "database", mode: "test" } },
    policy: null,
    env: { NODE_ENV: "development", PAYSTACK_LIVE_PAYMENTS_ENABLED: "false" },
  });
  const checks = Object.fromEntries(readiness.checks.map((item) => [item.key, item]));

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.eligible, false);
  assert.equal(checks.credentials.status, "configured");
  assert.equal(checks.customerIntegration.status, "unverified");
  assert.match(checks.minimumFundingAmounts.details.join(" "), /no minimum funding amount is configured/i);
  assert.equal(checks.kycProviders.status, "blocked");
  assert.equal(checks.kycPolicyApproval.status, "blocked");
  assert.equal(checks.transactionPolicy.status, "blocked");
  assert.equal(checks.tierFundingLimits.status, "blocked");
  assert.equal(checks.dailyFundingEnforcement.status, "blocked");
  assert.equal(checks.preferredBank.status, "blocked");
  assert.equal(checks.identification.status, "blocked");
  assert.equal(checks.livePayments.status, "blocked");
  assert.match(checks.tierFundingLimits.details.join(" "), /Tier 1: funding limits are missing/);
  assert.doesNotMatch(JSON.stringify(readiness), /sk_(?:test|live)_|bvnValue|accountNumber|accountName/i);
});

test("admin readiness reflects configured limits without requiring an invented minimum", () => {
  const tierPolicy = {
    maximumFundingPerTransaction: 500,
    maximumFundingPerDay: 1000,
    maximumWalletBalance: 2000,
    fundingMethods: ["paystack_dedicated_account"],
  };
  const readiness = buildPaystackDvaReadiness({
    credentials: { paystackSecretKey: { configured: true, mode: "test" } },
    policy: {
      approved: true,
      enforcementEnabled: true,
      approvalReference: "approved-policy",
      approvedAt: new Date(),
      approvedBy: "admin-id",
      dailyTimeZone: "Africa/Lagos",
      tier1: { ...tierPolicy },
      tier2: { ...tierPolicy },
      tier3: { ...tierPolicy },
    },
    env: { NODE_ENV: "development", PAYSTACK_LIVE_PAYMENTS_ENABLED: "false" },
  });
  const checks = Object.fromEntries(readiness.checks.map((item) => [item.key, item]));

  assert.equal(checks.transactionPolicy.status, "ready");
  assert.equal(checks.tierFundingLimits.status, "ready");
  assert.equal(checks.minimumFundingAmounts.status, "informational");
  assert.equal(checks.dailyFundingEnforcement.status, "blocked");
  assert.equal(checks.livePayments.status, "blocked");
  assert.equal(readiness.eligible, false);
});

const makeFundingScenario = ({ postJournal, holdReason = null } = {}) => {
  const funding = {
    _id: "funding-id",
    userId: "customer-id",
    reference: "SVP-test-reference",
    expectedAmountKobo: 12500,
    fundingCurrency: "NGN",
    fundingEmail: "customer@example.test",
    status: "pending",
    save: async () => {},
  };
  const user = {
    _id: "customer-id",
    walletBalance: 50,
    save: async () => {},
  };
  const journals = [];
  const exceptions = [];
  const session = {
    async withTransaction(callback) {
      const savedFunding = { ...funding };
      const savedBalance = user.walletBalance;
      const journalCount = journals.length;
      const exceptionCount = exceptions.length;
      try {
        await callback();
      } catch (error) {
        Object.assign(funding, savedFunding);
        user.walletBalance = savedBalance;
        journals.length = journalCount;
        exceptions.length = exceptionCount;
        throw error;
      }
    },
    async endSession() {},
  };
  const dependencies = {
    startSession: async () => session,
    Transaction: {
      findOne: (filter) => ({
        session: async () => filter.reference === funding.reference ? funding : null,
      }),
      findOneAndUpdate: async (filter, update) => {
        if (filter._id !== funding._id || funding.status !== "pending") return null;
        funding.status = update.$set.status;
        return funding;
      },
    },
    User: {
      findById: () => ({ session: async () => user }),
    },
    KycProfile: {
      findOne: () => ({ session: async () => ({}) }),
    },
    FundingException: {
      create: async ([exception]) => {
        exceptions.push(exception);
        return [exception];
      },
    },
    getCurrentKycTier: () => 1,
    getTransactionPolicy: async () => ({}),
    getFundingHoldReason: () => holdReason,
    postFinancialJournal: async (journal) => {
      if (postJournal) return postJournal(journal, journals);
      journals.push(journal);
      return { created: true };
    },
    recordFinancialAudit: async () => {},
    sendNotification: async () => {},
    emitWalletUpdate: () => {},
  };
  return { funding, user, journals, exceptions, dependencies };
};

test("server-verified Paystack funding updates wallet and posts the liability journal once", async () => {
  const scenario = makeFundingScenario();
  const outcome = await settleVerifiedPaystackPayment(makePayment(), scenario.dependencies);

  assert.equal(outcome.result, "success");
  assert.equal(scenario.user.walletBalance, 175);
  assert.equal(scenario.funding.status, "success");
  assert.equal(scenario.journals.length, 1);
  assert.equal(scenario.journals[0].idempotencyKey, `wallet-funding:${scenario.funding.reference}`);
  assert.deepEqual(scenario.journals[0].lines.map(({ account, debit = 0, credit = 0 }) => ({ account, debit, credit })), [
    { account: "assets:provider_clearing", debit: 125, credit: 0 },
    { account: "liabilities:customer_wallet", debit: 0, credit: 125 },
  ]);
});

test("repeated delivery and concurrent settlement credit at most once", async () => {
  const repeated = makeFundingScenario();
  assert.equal((await settleVerifiedPaystackPayment(makePayment(), repeated.dependencies)).result, "success");
  assert.equal((await settleVerifiedPaystackPayment(makePayment(), repeated.dependencies)).result, "duplicate");
  assert.equal(repeated.user.walletBalance, 175);
  assert.equal(repeated.journals.length, 1);

  const concurrent = makeFundingScenario();
  const results = await Promise.all([
    settleVerifiedPaystackPayment(makePayment(), concurrent.dependencies),
    settleVerifiedPaystackPayment(makePayment(), concurrent.dependencies),
  ]);
  assert.equal(results.filter(({ result }) => result === "success").length, 1);
  assert.equal(concurrent.user.walletBalance, 175);
  assert.equal(concurrent.journals.length, 1);
});

test("journal failure rolls back the wallet and funding state", async () => {
  const scenario = makeFundingScenario({
    postJournal: async () => { throw new Error("mock journal failure"); },
  });

  await assert.rejects(settleVerifiedPaystackPayment(makePayment(), scenario.dependencies), /mock journal failure/);
  assert.equal(scenario.user.walletBalance, 50);
  assert.equal(scenario.funding.status, "pending");
  assert.equal(scenario.journals.length, 0);
});

test("policy-ineligible funding is held in suspense without crediting wallet", async () => {
  const scenario = makeFundingScenario({ holdReason: "funding_policy_unconfigured" });
  const outcome = await settleVerifiedPaystackPayment(makePayment(), scenario.dependencies);

  assert.equal(outcome.result, "held");
  assert.equal(scenario.user.walletBalance, 50);
  assert.equal(scenario.funding.status, "held");
  assert.equal(scenario.exceptions.length, 1);
  assert.equal(scenario.journals[0].category, "funding_suspense");
});

test("pending and failed provider states do not credit the wallet", async () => {
  for (const [status, expected, finalStatus] of [["pending", "pending", "pending"], ["failed", "failed", "failed"]]) {
    const scenario = makeFundingScenario();
    const outcome = await settleVerifiedPaystackPayment({ ...makePayment(), status }, scenario.dependencies);
    assert.equal(outcome.result, expected);
    assert.equal(scenario.user.walletBalance, 50);
    assert.equal(scenario.funding.status, finalStatus);
    assert.equal(scenario.journals.length, 0);
  }
});

test("funding policy requires Paystack approval and Peyflex unknown responses remain pending", async () => {
  assert.equal(getFundingHoldReason({
    user: { isSuspended: false, walletBalance: 0 },
    tier: 1,
    policy: { tier1: { fundingMethods: ["paystack_dedicated_account"] } },
    amount: 100,
    fundingMethod: "paystack",
  }), "funding_policy_unconfigured");
  assert.equal(classifyPeyflexResponse({ status: "PENDING" }), "pending");
});

test("wallet funding requires a scoped step-up grant and transaction PIN", async () => {
  assert.ok(STEP_UP_ACTIONS.includes("wallet_funding"));
  assert.ok(StepUpGrant.schema.path("action").enumValues.includes("wallet_funding"));
  let status = 200;
  const response = {
    status(value) { status = value; return this; },
    json() { return this; },
  };
  await requireStepUp("wallet_funding")({ get: () => null }, response, () => assert.fail("missing step-up token must be rejected"));
  assert.equal(status, 403);
  assert.deepEqual(await authenticateTransactionPin({ pin: null }, "1234"), {
    ok: false,
    status: 400,
    message: "Please configure your transaction PIN first",
  });
});

test("wallet funding rejects unauthenticated requests before controller execution", async () => {
  let status = 200;
  let nextCalled = false;
  const response = {
    status(value) { status = value; return this; },
    json() { return this; },
  };
  await protect({ headers: {} }, response, () => { nextCalled = true; });
  assert.equal(status, 401);
  assert.equal(nextCalled, false);
});

test("mismatched provider reference, amount, or currency never credits the wallet", async () => {
  const invalidPayments = [
    { ...makePayment(), reference: "another-reference" },
    { ...makePayment(), amount: 12501 },
    { ...makePayment(), currency: "USD" },
  ];
  for (const payment of invalidPayments) {
    const scenario = makeFundingScenario();
    const outcome = await settleVerifiedPaystackPayment(payment, scenario.dependencies, "SVP-test-reference");
    assert.equal(outcome.result, "invalid");
    assert.equal(scenario.user.walletBalance, 50);
    assert.equal(scenario.funding.status, "pending");
    assert.equal(scenario.journals.length, 0);
  }
});

test("invalid webhook signatures are rejected before verification", async () => {
  let verifyCalls = 0;
  let status = 200;
  const handler = createPaystackWebhookHandler({
    getSecretKey: async () => "unit-test-secret",
    verifySignature: () => false,
    createLog: async () => ({ _id: "webhook-log" }),
    updateLog: async () => {},
    verifyAndSettlePayment: async () => { verifyCalls += 1; },
  });
  const response = {
    status(value) { status = value; return this; },
    json() { return this; },
  };

  await handler({
    headers: { "x-paystack-signature": "invalid" },
    rawBody: Buffer.from("{}"),
    body: { event: "charge.success", data: { reference: "SVP-test-reference" } },
  }, response);
  assert.equal(status, 401);
  assert.equal(verifyCalls, 0);
});

test("signed Paystack transfer events are acknowledged but never settle payouts", async () => {
  const loggedUpdates = [];
  let settlementCalls = 0;
  const handler = createPaystackWebhookHandler({
    getSecretKey: async () => "unit-test-secret",
    livePaymentsEnabled: () => false,
    verifySignature: () => true,
    createLog: async () => ({ _id: "transfer-log" }),
    updateLog: async (_id, update) => loggedUpdates.push(update),
    verifyAndSettlePayment: async () => { settlementCalls += 1; },
  });

  for (const event of ["transfer.success", "transfer.failed", "transfer.reversed"]) {
    let responseStatus = 200;
    const response = {
      status(value) { responseStatus = value; return this; },
      json(body) { this.body = body; return this; },
    };
    await handler({
      headers: { "x-paystack-signature": "valid" },
      rawBody: Buffer.from(JSON.stringify({ event })),
      body: { event, data: { reference: "unsupported-payout-reference" } },
    }, response);

    assert.equal(responseStatus, 200);
    assert.match(response.body.message, /payout status unchanged/i);
  }

  assert.equal(settlementCalls, 0);
  assert.equal(loggedUpdates.filter((update) => update.processingStatus === "held").length, 3);
  assert.ok(loggedUpdates
    .filter((update) => update.processingStatus === "held")
    .every((update) => /payout settlement is not configured/i.test(update.errorMessage || "")));
});

test("repeated signed webhook delivery verifies and settles only once", async () => {
  let status = "pending";
  let verifyCalls = 0;
  const logs = [];
  const handler = createPaystackWebhookHandler({
    getSecretKey: async () => "unit-test-secret",
    livePaymentsEnabled: () => true,
    verifySignature: () => true,
    createLog: async () => ({ _id: `webhook-${logs.length}` }),
    updateLog: async (id, update) => logs.push({ id, update }),
    findFunding: async () => ({ status }),
    verifyAndSettlePayment: async () => {
      verifyCalls += 1;
      status = "success";
      return { result: "success" };
    },
  });
  const call = async () => {
    let responseStatus = 200;
    const response = {
      status(value) { responseStatus = value; return this; },
      json(body) { this.body = body; return this; },
    };
    await handler({
      headers: { "x-paystack-signature": "valid" },
      rawBody: Buffer.from("{}"),
      body: { event: "charge.success", data: { reference: "SVP-test-reference" } },
    }, response);
    return { responseStatus, body: response.body };
  };

  assert.equal((await call()).responseStatus, 200);
  assert.equal((await call()).body.message, "Already processed");
  assert.equal(verifyCalls, 1);
});

test("Paystack DVA assignment webhooks update provider state without changing KYC", async () => {
  const user = {
    paystackCustomer: { customerCode: "CUS_test", identificationStatus: "pending", dedicatedAccountStatus: "pending" },
    save: async () => {},
  };
  const result = await applyPaystackDedicatedAccountEvent({
    event: "dedicatedaccount.assign.success",
    data: {
      customer_code: "CUS_test",
      dedicated_account: {
        id: 21,
        assigned: true,
        active: true,
        account_number: "0000000000",
        account_name: "Test Customer",
        bank: { name: "Test Bank", slug: "test-bank" },
        currency: "NGN",
      },
    },
  }, { UserModel: { findOne: () => ({ select: async () => user }) } });

  assert.equal(result.result, "updated");
  assert.equal(user.paystackCustomer.dedicatedAccountStatus, "active");
  assert.equal(user.paystackCustomer.dedicatedAccountNumber, "0000000000");
  assert.equal(user.paystackCustomer.identificationStatus, "pending");
  assert.equal(user.kycProfile, undefined);
});

test("verified Paystack DVA transfers bind to the active customer account and credit once", async () => {
  const scenario = makeFundingScenario();
  const user = scenario.user;
  user.email = "customer@example.test";
  user.paystackCustomer = { customerCode: "CUS_test", dedicatedAccountStatus: "active" };
  let dvaTransaction = null;
  scenario.dependencies.User.findOne = () => ({ select: async () => user });
  scenario.dependencies.Transaction.findOne = () => ({
    then(resolve) { resolve(dvaTransaction); },
    session: async () => dvaTransaction,
  });
  scenario.dependencies.Transaction.create = async ([data]) => {
    dvaTransaction = { ...data, _id: "dva-funding", status: "pending", save: async () => {} };
    return [dvaTransaction];
  };
  scenario.dependencies.Transaction.findOneAndUpdate = async (_filter, update) => {
    if (dvaTransaction?.status !== "pending") return null;
    dvaTransaction.status = update.$set.status;
    return dvaTransaction;
  };
  const payment = {
    ...makePayment(),
    customer: { code: "CUS_test", email: "customer@example.test" },
    authorization: { channel: "dedicated_nuban" },
  };

  const outcome = await settleVerifiedPaystackDedicatedTransfer(payment, scenario.dependencies);
  assert.equal(outcome.result, "success");
  assert.equal(user.walletBalance, 175);
  assert.equal(dvaTransaction.fundingMode, "dedicated_account");
  assert.equal(dvaTransaction.providerCustomerCode, "CUS_test");
  assert.equal(scenario.journals.length, 1);
  assert.equal((await settleVerifiedPaystackDedicatedTransfer(payment, scenario.dependencies)).result, "duplicate");
  assert.equal(user.walletBalance, 175);
});

test("unmatched verified Paystack DVA transfers are journaled to suspense", async () => {
  const scenario = makeFundingScenario();
  const user = { paystackCustomer: { dedicatedAccountStatus: "not_started" } };
  scenario.dependencies.User.findOne = () => ({ select: async () => null });
  scenario.dependencies.FundingException.findOne = () => ({ session: async () => null });
  const payment = {
    ...makePayment(),
    customer: { customer_code: "CUS_unmatched" },
    authorization: { channel: "dedicated_nuban" },
  };

  const outcome = await settleVerifiedPaystackDedicatedTransfer(payment, scenario.dependencies);
  assert.equal(outcome.result, "held");
  assert.equal(scenario.exceptions[0].reasonCode, "account_unmatched");
  assert.equal(scenario.user.walletBalance, 50);
  assert.equal(scenario.journals[0].category, "funding_suspense");
});

test("Paystack webhook logs redact BVN, account, and customer contact fields", async (context) => {
  let stored;
  context.mock.method(WebhookLog, "create", async (document) => {
    stored = document;
    return document;
  });

  await createWebhookLog({
    provider: "paystack",
    headers: { "x-paystack-signature": "test-signature" },
    payload: {
      data: {
        bvn: "20012345678",
        account_number: "0123456789",
        email: "customer@example.test",
      },
    },
  });

  assert.equal(stored.payload.data.bvn, "[REDACTED]");
  assert.equal(stored.payload.data.account_number, "[REDACTED]");
  assert.equal(stored.payload.data.email, "[REDACTED]");
  assert.equal(stored.headers["x-paystack-signature"], "[REDACTED]");
});

test("DVA assignment remains blocked by current tier policy before Paystack calls", async () => {
  let providerCalls = 0;
  const user = {
    fullName: "Test Customer",
    email: "customer@example.test",
    phone: "+2348000000000",
    isSuspended: false,
    paystackCustomer: { customerStatus: "not_started", dedicatedAccountStatus: "not_started" },
  };
  const controller = createPaystackDedicatedAccountController({
    UserModel: { findById: () => ({ select: async () => user }) },
    KycProfileModel: { findOne: () => ({ lean: async () => ({}) }) },
    TierPolicyModel: { findOne: () => ({ lean: async () => ({}) }) },
    gatewayClient: {
      fetchCustomer: async () => { providerCalls += 1; },
      createCustomer: async () => { providerCalls += 1; },
      assignDedicatedAccount: async () => { providerCalls += 1; },
    },
    getBlockReason: () => "verification_required",
  });
  let responseStatus = 200;
  let body;
  const response = {
    status(value) { responseStatus = value; return this; },
    json(value) { body = value; return this; },
  };

  await controller.assign({ req: undefined, user: { id: "customer-id" }, body: { consent: true } }, response);
  assert.equal(responseStatus, 503);
  assert.equal(body.code, "PAYSTACK_DVA_UNAVAILABLE");
  assert.equal(providerCalls, 0);
});

test("eligible DVA assignment reuses the customer and stores an active account", async () => {
  const user = {
    _id: "customer-id",
    fullName: "Test Customer",
    email: "customer@example.test",
    phone: "+2348000000000",
    isSuspended: false,
    paystackCustomer: {
      customerCode: "CUS_existing",
      customerStatus: "created",
      identificationStatus: "verified",
      dedicatedAccountStatus: "not_started",
    },
    save: async () => {},
  };
  let fetchedCode;
  let assignedCustomerCode;
  const controller = createPaystackDedicatedAccountController({
    UserModel: {
      findById: () => ({ select: async () => user }),
      findOneAndUpdate: () => ({ select: async () => user }),
    },
    KycProfileModel: { findOne: () => ({ lean: async () => ({}) }) },
    TierPolicyModel: { findOne: () => ({ lean: async () => ({}) }) },
    gatewayClient: {
      fetchCustomer: async (code) => { fetchedCode = code; return null; },
      assignDedicatedAccount: async ({ customerCode }) => {
        assignedCustomerCode = customerCode;
        return {
          status: "active",
          id: 21,
          accountNumber: "0000000000",
          accountName: "Test Customer",
          bankName: "Test Bank",
          bankSlug: "test-bank",
          currency: "NGN",
        };
      },
    },
    getBlockReason: () => null,
    env: { NODE_ENV: "test" },
  });
  let responseStatus = 200;
  let body;
  const response = {
    status(value) { responseStatus = value; return this; },
    json(value) { body = value; return this; },
  };

  await controller.assign({ user: { id: "customer-id" }, body: { consent: true } }, response);

  assert.equal(responseStatus, 200);
  assert.equal(fetchedCode, "CUS_existing");
  assert.equal(assignedCustomerCode, "CUS_existing");
  assert.equal(user.paystackCustomer.dedicatedAccountStatus, "active");
  assert.equal(body.account.accountNumber, "0000000000");
});

test("signed DVA status events are processed even while wallet payments are disabled", async () => {
  let eventCalls = 0;
  let verificationCalls = 0;
  let responseStatus = 200;
  const logs = [];
  const handler = createPaystackWebhookHandler({
    getSecretKey: async () => "unit-test-secret",
    livePaymentsEnabled: () => false,
    verifySignature: () => true,
    createLog: async () => ({ _id: "dva-log" }),
    updateLog: async (_id, update) => logs.push(update),
    applyDedicatedAccountEvent: async () => { eventCalls += 1; return { result: "updated" }; },
    verifyAndSettleDedicatedPayment: async () => { verificationCalls += 1; },
  });
  const response = {
    status(value) { responseStatus = value; return this; },
    json(value) { this.body = value; return this; },
  };

  await handler({
    headers: { "x-paystack-signature": "valid" },
    rawBody: Buffer.from("{}"),
    body: { event: "customeridentification.success", data: { customer_code: "CUS_test" } },
  }, response);

  assert.equal(responseStatus, 200);
  assert.equal(eventCalls, 1);
  assert.equal(verificationCalls, 0);
  assert.ok(logs.some((entry) => entry.processingStatus === "processed"));
});

test("signed DVA charge events require the dedicated verifier and settle to suspense safely", async () => {
  let verifiedReference;
  let responseStatus = 200;
  const handler = createPaystackWebhookHandler({
    getSecretKey: async () => "unit-test-secret",
    livePaymentsEnabled: () => true,
    verifySignature: () => true,
    createLog: async () => ({ _id: "charge-log" }),
    updateLog: async () => {},
    verifyAndSettleDedicatedPayment: async (data) => {
      verifiedReference = data.reference;
      return { result: "held" };
    },
  });
  const response = {
    status(value) { responseStatus = value; return this; },
    json(value) { this.body = value; return this; },
  };

  await handler({
    headers: { "x-paystack-signature": "valid" },
    rawBody: Buffer.from("{}"),
    body: {
      event: "charge.success",
      data: { reference: "paystack-dva-ref", authorization: { channel: "dedicated_nuban" } },
    },
  }, response);

  assert.equal(verifiedReference, "paystack-dva-ref");
  assert.equal(responseStatus, 200);
  assert.equal(response.body.message, "Payment received and held for review");
});

test("DVA charge events cannot verify or settle while live payments are disabled", async () => {
  let verifierCalls = 0;
  let responseStatus = 200;
  const handler = createPaystackWebhookHandler({
    getSecretKey: async () => "unit-test-secret",
    livePaymentsEnabled: () => false,
    verifySignature: () => true,
    createLog: async () => ({ _id: "disabled-dva-log" }),
    updateLog: async () => {},
    verifyAndSettleDedicatedPayment: async () => { verifierCalls += 1; },
  });
  const response = {
    status(value) { responseStatus = value; return this; },
    json(value) { this.body = value; return this; },
  };

  await handler({
    headers: { "x-paystack-signature": "valid" },
    rawBody: Buffer.from("{}"),
    body: {
      event: "charge.success",
      data: { reference: "paystack-dva-ref", authorization: { channel: "dedicated_nuban" } },
    },
  }, response);

  assert.equal(responseStatus, 503);
  assert.equal(verifierCalls, 0);
});