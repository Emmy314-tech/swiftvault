import mongoose from "mongoose";

const fundingExceptionSchema = new mongoose.Schema({
  paymentReference: { type: String, required: true },
  accountReference: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true },
  status: { type: String, enum: ["held", "resolved"], default: "held", required: true },
  reasonCode: {
    type: String,
    enum: ["account_unmatched", "account_suspended", "verification_required", "funding_policy_unconfigured", "wallet_balance_limit", "funding_amount_below_minimum", "funding_transaction_limit"],
    required: true,
  },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  resolutionReference: { type: String, default: null, maxlength: 200 },
}, { timestamps: true });

fundingExceptionSchema.index({ paymentReference: 1 }, { unique: true });
fundingExceptionSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model("FundingException", fundingExceptionSchema);
