import mongoose from "mongoose";

const paystackCustomerSchema = new mongoose.Schema({
  customerCode: { type: String, default: null },
  customerStatus: { type: String, enum: ["not_started", "pending", "created", "failed"], default: "not_started" },
  identificationStatus: { type: String, enum: ["not_started", "pending", "verified", "failed"], default: "not_started" },
  dedicatedAccountStatus: { type: String, enum: ["not_started", "pending", "active", "failed"], default: "not_started" },
  dedicatedAccountId: { type: Number, default: null },
  dedicatedAccountNumber: { type: String, default: null },
  dedicatedAccountName: { type: String, default: null },
  dedicatedBankName: { type: String, default: null },
  dedicatedBankSlug: { type: String, default: null },
  dedicatedCurrency: { type: String, enum: ["NGN", "GHS", null], default: null },
  consentedAt: { type: Date, default: null },
  lastErrorCode: { type: String, default: null, maxlength: 80 },
}, { _id: false });

const userSchema = new mongoose.Schema({
  fullName: String,
  username: { type: String, unique: true },
  email: { type: String, unique: true },
  phone: { type: String, unique: true, required: true },
  password: String,

  role: {
    type: String,
    default: "user"
  },
  tier: {
    type: String,
    enum: ["normal", "retail", "wholesale"],
    default: "normal",
  },
  isUpgraded: { type: Boolean, default: false },
  upgradedAt: { type: Date, default: null },
  businessName: { type: String, default: null },

  referralCode: { type: String, unique: true },
  referredBy: String, 

  walletBalance: { type: Number, default: 0 },
  bonusBalance: { type: Number, default: 0 },
  welcomeBonusAwardedAt: { type: Date, default: null },
dailyTransferAmount: {
  type: Number,
  default: 0,
},
virtualAccountNumber: {
  type: String,
  default: null,
},

virtualAccountName: {
  type: String,
  default: null,
},

virtualBankName: {
  type: String,
  default: null,
},

virtualAccountReference: {
  type: String,
  default: null,
},
paystackCustomer: {
  type: paystackCustomerSchema,
  default: () => ({}),
  select: false,
},
dailyTransferDate: {
  type: Date,
},

isFlagged: {
  type: Boolean,
  default: false,
},

flagReason: {
  type: String,
  default: "",
},

lastTransferAt: {
  type: Date,
},

rapidTransferCount: {
  type: Number,
  default: 0,
},
pinAttempts: {
  type: Number,
  default: 0,
},

pinLockedUntil: {
  type: Date,
  default: null,
},

loginAttempts: {
  type: Number,
  default: 0,
},

loginLockedUntil: {
  type: Date,
  default: null,
},
authTokenVersion: { type: Number, default: 0, min: 0 },
securityCooldownUntil: { type: Date, default: null },
pin: { type: String, default: null },
  adminPin: { type: String, default: null },
  adminPinAttempts: { type: Number, default: 0 },
  adminPinLockedUntil: { type: Date, default: null },
  
  // PHONE OTP SECURITY LIFECYCLE
  phoneVerified: { type: Boolean, default: false },
  isSuspended: { type: Boolean, default: false },
  phoneOTP: { type: String, default: null },
  phoneOTPExpires: { type: Date, default: null },
  phoneOTPPurpose: {
    type: String,
    enum: ["phone_verification", "password_reset", "phone_update", null],
    default: null,
  },
}, { timestamps: true });

userSchema.index({ "paystackCustomer.customerCode": 1 }, {
  name: "unique_paystack_customer_code",
  unique: true,
  partialFilterExpression: { "paystackCustomer.customerCode": { $type: "string" } },
});

userSchema.index({ "paystackCustomer.dedicatedAccountNumber": 1 }, {
  name: "unique_paystack_dedicated_account_number",
  unique: true,
  partialFilterExpression: { "paystackCustomer.dedicatedAccountNumber": { $type: "string" } },
});

export default mongoose.model("User", userSchema);
