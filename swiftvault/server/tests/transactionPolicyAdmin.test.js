import assert from "node:assert/strict";
import test from "node:test";
import Settings from "../models/Settings.js";
import {
  createUpdateTransactionPolicyLimitsHandler,
  validateTransactionPolicyLimits,
} from "../controllers/settingsController.js";

test("internal wallet transfer fees default to zero", () => {
  const settings = new Settings();
  assert.equal(settings.transferFees.wallet.lowerFee, 0);
  assert.equal(settings.transferFees.wallet.higherFee, 0);
});

test("transaction policy updates accept non-negative tier limits and null reset values", () => {
  assert.doesNotThrow(() => validateTransactionPolicyLimits({
    tier1: {
      minimumAmount: 100,
      maximumPerTransaction: 5000,
      maximumOutgoingCountPerDay: 20,
      maximumWalletBalance: null,
    },
    tier3: { maximumFundingPerDay: 100000 },
  }));
});

test("transaction policy updates reject empty, unknown, negative, and fractional values", () => {
  for (const invalid of [
    {},
    { tier4: { maximumPerTransaction: 1000 } },
    { tier1: { approved: true } },
    { tier1: { maximumPerTransaction: -1 } },
    { tier2: { maximumFundingPerDay: 1.5 } },
  ]) {
    assert.throws(() => validateTransactionPolicyLimits(invalid));
  }
});

test("saving tier limits invalidates approval and never enables enforcement", async () => {
  const policy = {
    tier1: {},
    tier2: {},
    tier3: {},
    approved: true,
    enforcementEnabled: true,
    approvalReference: "previous-approval",
    approvedAt: new Date(),
    approvedBy: "admin-id",
    dailyTimeZone: "Africa/Lagos",
    async save() { this.saved = true; },
  };
  let auditEntry;
  const handler = createUpdateTransactionPolicyLimitsHandler({
    TierPolicyModel: {
      async findOne() { return policy; },
    },
    async logActivity(entry) { auditEntry = entry; },
  });
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await handler({
    body: { tiers: { tier1: { maximumPerTransaction: 5000 } } },
    user: { id: "admin-id" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(policy.tier1.maximumPerTransaction, 5000);
  assert.equal(policy.approved, false);
  assert.equal(policy.enforcementEnabled, false);
  assert.equal(policy.approvalReference, null);
  assert.equal(policy.approvedAt, null);
  assert.equal(policy.approvedBy, null);
  assert.equal(policy.dailyTimeZone, null);
  assert.equal(res.body.approved, false);
  assert.equal(res.body.enforcementEnabled, false);
  assert.equal(policy.saved, true);
  assert.equal(auditEntry.action, "transaction_policy_limits_updated");
});
