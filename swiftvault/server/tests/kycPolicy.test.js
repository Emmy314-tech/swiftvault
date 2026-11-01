import assert from "node:assert/strict";
import test from "node:test";
import Transaction from "../models/Transaction.js";
import KycProfile from "../models/KycProfile.js";
import FundingException from "../models/FundingException.js";
import TierPolicy from "../models/TierPolicy.js";
import User from "../models/User.js";
import AuthSession from "../models/AuthSession.js";
import { requireTransactionPolicy } from "../middleware/requireTransactionPolicy.js";
import KycAttempt from "../models/KycAttempt.js";
import { verifyPhoneOTP } from "../controllers/authController.js";
import { hashOTP } from "../services/otpService.js";
import { startKycTier } from "../controllers/kycController.js";
import {
  canApproveTierThree,
  areTierOneChecksVerified,
  getFundingHoldReason,
  getCurrentKycTier,
  getPolicyConfigurationBlockReason,
  getPolicyBlockReason,
  KYC_CAPABILITIES,
  KYC_REQUIREMENTS_APPROVED,
} from "../services/kycPolicyService.js";

test("new verification and transaction policies default to unverified and disabled", () => {
  const profile = new KycProfile({ userId: "507f1f77bcf86cd799439011" });
  const policy = new TierPolicy();

  assert.equal(profile.tier1.status, "not_started");
  assert.equal(profile.tier2.status, "not_started");
  assert.equal(profile.tier3.status, "not_started");
  assert.equal(getCurrentKycTier(profile), 0);
  assert.equal(policy.approved, false);
  assert.equal(policy.enforcementEnabled, false);
  assert.equal(policy.dailyTimeZone, null);
  assert.equal(policy.tier1.maximumPerTransaction, null);
  assert.equal(profile.schema.path("tier1.providerReference").options.select, false);
});

test("funding exceptions have a unique payment reference for callback deduplication", () => {
  const index = FundingException.schema.indexes().find(([keys]) => keys.paymentReference === 1);
  assert.ok(index);
  assert.equal(index[1].unique, true);
});

test("identity and liveness provider capabilities remain explicitly unconfigured", () => {
  assert.deepEqual(Object.values(KYC_CAPABILITIES), [
    "UNCONFIGURED",
    "UNCONFIGURED",
    "UNCONFIGURED",
    "UNCONFIGURED",
    "UNCONFIGURED",
    "UNCONFIGURED",
  ]);
});

test("phone activation does not create a provider account or credit an unapproved welcome bonus", async (context) => {
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "local-test-secret";
  context.after(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  const user = {
    _id: "507f1f77bcf86cd799439011",
    fullName: "Test User",
    username: "test-user",
    phone: "2348000000000",
    phoneVerified: false,
    phoneOTP: await hashOTP("123456"),
    phoneOTPExpires: new Date(Date.now() + 60_000),
    phoneOTPPurpose: "phone_verification",
    walletBalance: 0,
    tier: "normal",
    isUpgraded: false,
    save: async () => {},
  };
  context.mock.method(User, "findOne", async () => user);
  context.mock.method(User, "findOneAndUpdate", async () => {
    user.phoneVerified = true;
    user.phoneOTP = null;
    user.phoneOTPExpires = null;
    return user;
  });
  context.mock.method(AuthSession, "create", async () => ({ _id: "test-session" }));
  let transactionCreateCalls = 0;
  context.mock.method(Transaction, "create", async () => { transactionCreateCalls += 1; });

  let responseBody;
  const res = { json(body) { responseBody = body; return this; } };
  await verifyPhoneOTP({ body: { phone: user.phone, otp: "123456" } }, res);

  assert.equal(user.phoneVerified, true);
  assert.equal(user.walletBalance, 0);
  assert.equal(transactionCreateCalls, 0);
  assert.match(responseBody.message, /funding and welcome bonuses are unavailable/i);
});

test("starting verification is blocked and only records a non-sensitive provider dependency", async (context) => {
  const userId = "507f1f77bcf86cd799439011";
  let recordedAttempt;
  context.mock.method(KycAttempt, "create", async (attempt) => {
    recordedAttempt = attempt;
  });
  let statusCode = 200;
  let responseBody;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { responseBody = body; return this; },
  };

  await startKycTier({ params: { tier: "1" }, user: { id: userId } }, res);
  assert.equal(statusCode, 503);
  assert.equal(responseBody.code, "VERIFICATION_PROVIDER_UNCONFIGURED");
  assert.equal(recordedAttempt.userId, userId);
  assert.equal(recordedAttempt.reasonCode, "provider_unconfigured");
  assert.equal(Object.hasOwn(recordedAttempt, "bvn"), false);
  assert.match(responseBody.message, /No personal identity or biometric data was collected/);
});

test("missing or unapproved limits fail closed for every customer transaction class", () => {
  for (const action of ["transfer", "service", "funding", "withdrawal", "membership"]) {
    assert.match(getPolicyConfigurationBlockReason(null, action, 1), /not been configured/i);
  }

  const incompletePolicy = {
    approved: true,
    enforcementEnabled: true,
    approvalReference: "policy-approval",
    approvedAt: new Date(),
    approvedBy: "507f1f77bcf86cd799439011",
    dailyTimeZone: "Africa/Lagos",
    tier1: {},
    tier2: {},
    tier3: {},
  };
  assert.match(getPolicyConfigurationBlockReason(incompletePolicy, "transfer", 1), /limits.*unavailable/i);
  assert.match(getPolicyConfigurationBlockReason({ ...incompletePolicy, dailyTimeZone: null }, "transfer", 1), /timezone/i);
  assert.match(getPolicyConfigurationBlockReason({ ...incompletePolicy, enforcementEnabled: false }, "transfer", 1), /not been configured/i);

  const configuredTier = {
    maximumPerTransaction: 100,
    maximumOutgoingPerDay: 1000,
    maximumOutgoingCountPerDay: 5,
  };
  const approvedPolicy = {
    ...incompletePolicy,
    tier1: configuredTier,
  };
  assert.equal(getPolicyConfigurationBlockReason(approvedPolicy, "transfer", 1), null);
  assert.match(getPolicyBlockReason(approvedPolicy, "transfer", 1), /atomic daily transaction reservations/i);
});

test("Paystack credits are held for unmatched, suspended, unverified, or unconfigured recipients", () => {
  assert.equal(getFundingHoldReason({ user: null, tier: 0, policy: null, amount: 100 }), "account_unmatched");
  assert.equal(getFundingHoldReason({ user: { isSuspended: true }, tier: 1, policy: null, amount: 100 }), "account_suspended");
  assert.equal(getFundingHoldReason({ user: { isSuspended: false }, tier: 0, policy: null, amount: 100 }), "verification_required");
  assert.equal(getFundingHoldReason({
    user: { isSuspended: false, walletBalance: 0 },
    tier: 1,
    policy: null,
    amount: 100,
  }), "funding_policy_unconfigured");
});

test("funding policy requires a permitted method and rejects balance-cap overruns", () => {
  const policy = {
    approved: true,
    enforcementEnabled: true,
    approvalReference: "policy-approval",
    approvedAt: new Date(),
    approvedBy: "507f1f77bcf86cd799439011",
    dailyTimeZone: "Africa/Lagos",
    tier1: {
      maximumFundingPerTransaction: 500,
      maximumFundingPerDay: 1000,
      maximumWalletBalance: 1000,
      fundingMethods: ["paystack"],
    },
  };
  const user = { isSuspended: false, walletBalance: 900 };

  assert.equal(getFundingHoldReason({ user, tier: 1, policy, amount: 101 }), "wallet_balance_limit");
  assert.equal(getFundingHoldReason({
    user,
    tier: 1,
    policy: { ...policy, tier1: { ...policy.tier1, fundingMethods: [] } },
    amount: 50,
  }), "funding_policy_unconfigured");
  assert.equal(getFundingHoldReason({ user, tier: 1, policy, amount: 50 }), "funding_policy_unconfigured");
});

test("funding minimum and maximum are checked before settlement policy", () => {
  const policy = {
    tier1: {
      minimumAmount: 50,
      maximumFundingPerTransaction: 500,
      maximumWalletBalance: 2000,
      fundingMethods: ["paystack_dedicated_account"],
    },
  };
  const user = { isSuspended: false, walletBalance: 100 };

  assert.equal(getFundingHoldReason({ user, tier: 1, policy, amount: 49 }), "funding_amount_below_minimum");
  assert.equal(getFundingHoldReason({ user, tier: 1, policy, amount: 501 }), "funding_transaction_limit");
});

test("verification checks cannot promote a user before tier requirements are approved", () => {
  const tierOne = {
    status: "verified",
    bvn: "verified",
    bvnNameMatch: "verified",
    dateOfBirthMatch: "verified",
    ninConsistency: "verified",
    faceLiveness: "verified",
  };
  const tierTwo = { status: "verified", nin: "verified", identityMatch: "verified" };
  const approvedRequirements = {
    tier1: true,
    tier1NinConsistencyRequired: false,
    tier1BvnNameMatchRequired: true,
    tier2: true,
    tier3: true,
    tier3AddressRequired: false,
    tier3SupportingDocumentsRequired: false,
  };
  assert.equal(KYC_REQUIREMENTS_APPROVED.tier1, false);
  assert.equal(KYC_REQUIREMENTS_APPROVED.tier1NinConsistencyRequired, null);
  assert.equal(areTierOneChecksVerified({ tier1: tierOne }), false);
  assert.equal(areTierOneChecksVerified({ tier1: tierOne }, approvedRequirements), true);
  assert.equal(areTierOneChecksVerified({ tier1: { ...tierOne, dateOfBirthMatch: "rejected" } }, approvedRequirements), false);
  assert.equal(areTierOneChecksVerified({ tier1: { ...tierOne, bvnNameMatch: "pending" } }, approvedRequirements), false);
  assert.equal(areTierOneChecksVerified({ tier1: { ...tierOne, ninConsistency: "action_required" } }, { ...approvedRequirements, tier1NinConsistencyRequired: true }), false);
  assert.equal(areTierOneChecksVerified({ tier1: { ...tierOne, faceLiveness: "pending" } }, approvedRequirements), false);
  assert.equal(areTierOneChecksVerified({ tier1: { ...tierOne, faceLiveness: "rejected" } }, approvedRequirements), false);
  assert.equal(getCurrentKycTier({ tier1: tierOne, tier2: { status: "pending" }, tier3: {} }, approvedRequirements), 1);
  assert.equal(getCurrentKycTier({ tier1: { ...tierOne, dateOfBirthMatch: "rejected" }, tier2: tierTwo, tier3: {} }, approvedRequirements), 0);
  assert.equal(getCurrentKycTier({ tier1: tierOne, tier2: tierTwo, tier3: {} }, approvedRequirements), 2);
  assert.equal(getCurrentKycTier({
    tier1: tierOne,
    tier2: tierTwo,
    tier3: { status: "verified", address: "verified", supportingDocuments: "verified", manualReview: "verified" },
  }, approvedRequirements), 3);
  assert.equal(getCurrentKycTier({ tier1: tierOne, tier2: tierTwo, tier3: {} }), 0);
  assert.equal(canApproveTierThree({ tier1: {}, tier2: {}, tier3: {} }, approvedRequirements), false);
  assert.equal(canApproveTierThree({
    tier1: tierOne,
    tier2: tierTwo,
    tier3: { manualReview: "verified" },
  }, approvedRequirements), true);
  assert.equal(canApproveTierThree({
    tier1: tierOne,
    tier2: tierTwo,
    tier3: {},
  }, { ...approvedRequirements, tier3AddressRequired: true }), false);
});

test("parallel requests are denied before customer transaction handlers run", async (context) => {
  const userId = "507f1f77bcf86cd799439011";
  const profile = {
    tier1: {
      status: "verified",
      bvn: "verified",
      bvnNameMatch: "verified",
      dateOfBirthMatch: "verified",
      ninConsistency: "verified",
      faceLiveness: "verified",
    },
    tier2: { status: "not_started" },
    tier3: { status: "not_started" },
  };
  context.mock.method(TierPolicy, "findOne", () => ({ lean: async () => null }));
  context.mock.method(User, "findById", () => ({ select: async () => ({ _id: userId, isSuspended: false }) }));
  context.mock.method(KycProfile, "findOne", () => ({ lean: async () => profile }));

  const middleware = requireTransactionPolicy("transfer");
  let nextCalls = 0;
  const invoke = async () => {
    let statusCode = 200;
    let body;
    const res = {
      status(code) { statusCode = code; return this; },
      json(value) { body = value; return this; },
    };
    await middleware({ user: { id: userId } }, res, () => { nextCalls += 1; });
    return { statusCode, body };
  };

  const results = await Promise.all([invoke(), invoke()]);
  assert.deepEqual(results.map((result) => result.statusCode), [503, 503]);
  assert.equal(nextCalls, 0);
  assert.ok(results.every((result) => result.body.code === "TRANSACTION_POLICY_UNCONFIGURED"));
});
