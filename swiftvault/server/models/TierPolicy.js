import mongoose from "mongoose";

const tierLimitsSchema = new mongoose.Schema({
  minimumAmount: { type: Number, default: null, min: 0 },
  maximumPerTransaction: { type: Number, default: null, min: 0 },
  maximumOutgoingPerDay: { type: Number, default: null, min: 0 },
  maximumOutgoingCountPerDay: { type: Number, default: null, min: 0 },
  maximumWalletBalance: { type: Number, default: null, min: 0 },
  maximumFundingPerTransaction: { type: Number, default: null, min: 0 },
  maximumFundingPerDay: { type: Number, default: null, min: 0 },
  maximumWithdrawalPerTransaction: { type: Number, default: null, min: 0 },
  maximumWithdrawalPerDay: { type: Number, default: null, min: 0 },
  maximumWithdrawalCountPerDay: { type: Number, default: null, min: 0 },
  fundingMethods: { type: [String], default: [] },
  eligibleServices: { type: [String], default: [] },
  additionalChecks: { type: [String], default: [] },
}, { _id: false });

const tierPolicySchema = new mongoose.Schema({
  key: { type: String, enum: ["customer_transaction_policy"], unique: true, default: "customer_transaction_policy" },
  approved: { type: Boolean, default: false },
  enforcementEnabled: { type: Boolean, default: false },
  approvalReference: { type: String, default: null },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  dailyTimeZone: { type: String, default: null },
  tier1: { type: tierLimitsSchema, default: () => ({}) },
  tier2: { type: tierLimitsSchema, default: () => ({}) },
  tier3: { type: tierLimitsSchema, default: () => ({}) },
}, { timestamps: true });

export default mongoose.model("TierPolicy", tierPolicySchema);
