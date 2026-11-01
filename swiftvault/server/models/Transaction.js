import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  type: {
    type: String,
enum: [
  "welcome_bonus",
  "referral_bonus",
  "wallet_funding",
  "wallet_transfer",
  "transfer",
  "wallet_received",
  "withdrawal",
  "upgrade",
  "referral_upgrade_bonus",
  "admin_adjustment",
  "company_withdrawal",
  "airtime",
  "data_purchase",
  "epin",
  "electricity",
  "cable_tv",
  "exam_pin",
  "refund"
],
    required: true
  },

  amount: {
    type: Number,
    required: true
  },

  fee: {
    type: Number,
    default: 0,
  },

  providerCost: {
    type: Number,
    default: null,
  },

  providerFee: {
    type: Number,
    default: 0,
  },

  pricingSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },

  balanceBefore: {
    type: Number,
    default: null
  },
  walletAllocation: {
    wallet: { type: Number, default: null },
    bonus: { type: Number, default: null },
  },

  idempotencyKey: {
    type: String,
    default: null,
  },

  requestFingerprint: {
    type: String,
    default: null,
  },

  recipient: {
    name: { type: String, default: null },
    phone: { type: String, default: null },
  },

  description: {
    type: String,
    default: ""
  },

  status: {
    type: String,
    enum: ["pending", "processing", "success", "failed", "held"],
    default: "success"
  },
  provider: {
    type: String,
    enum: ["monnify", "paystack", "peyflex", null],
    default: null,
  },
  expectedAmountKobo: {
    type: Number,
    default: null,
    min: 1,
    validate: {
      validator: (value) => value === null || (Number.isSafeInteger(value) && value > 0),
      message: "Expected payment amount must be a positive safe integer in kobo.",
    },
  },
  fundingCurrency: { type: String, enum: ["NGN"], default: null },
  fundingEmail: { type: String, default: null, lowercase: true, trim: true },
  fundingMode: { type: String, enum: ["checkout", "dedicated_account", null], default: null },
  providerCustomerCode: { type: String, default: null },
  checkoutUrl: { type: String, default: null, select: false },
  verifiedAt: { type: Date, default: null },
reference: {
  type: String,
  default: null
},
upgradeAllocation: {
  company: { type: Number, default: null },
  referrer: { type: Number, default: 0 },
  referrerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
},

}, { timestamps: true });

transactionSchema.index(
  { reference: 1 },
  {
    name: "unique_wallet_funding_reference",
    unique: true,
    partialFilterExpression: { type: "wallet_funding", reference: { $type: "string" } },
  }
);

transactionSchema.index(
  { userId: 1, idempotencyKey: 1 },
  {
    name: "unique_user_transaction_idempotency_key",
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);

transactionSchema.index(
  { userId: 1, requestFingerprint: 1 },
  {
    name: "unique_pending_user_request_fingerprint",
    unique: true,
    partialFilterExpression: { status: "pending", requestFingerprint: { $type: "string" } },
  }
);

transactionSchema.index(
  { userId: 1 },
  {
    name: "unique_paid_upgrade_per_user",
    unique: true,
    partialFilterExpression: {
      type: "upgrade",
      "upgradeAllocation.company": { $type: "number" },
    },
  }
);

transactionSchema.index(
  { reference: 1 },
  {
    name: "unique_upgrade_payment_reference",
    unique: true,
    partialFilterExpression: {
      type: "upgrade",
      reference: { $type: "string" },
      "upgradeAllocation.company": { $type: "number" },
    },
  }
);

transactionSchema.index(
  { reference: 1 },
  {
    name: "unique_referral_bonus_source",
    unique: true,
    partialFilterExpression: {
      type: "referral_upgrade_bonus",
      reference: { $type: "string" },
    },
  }
);

export default mongoose.model(
  "Transaction",
  transactionSchema
);
