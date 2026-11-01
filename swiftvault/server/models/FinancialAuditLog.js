import mongoose from "mongoose";

const financialAuditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    operationType: {
      type: String,
      required: true,
      enum: [
        "wallet_funding", "swiftvault_transfer_debit", "swiftvault_transfer_credit",
        "bank_transfer", "vtu_purchase", "vtu_refund", "upgrade", "upgrade_company_allocation",
        "referral_commission", "admin_wallet_adjustment", "company_withdrawal",
      ],
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    source: { type: String, default: "system" },
    destination: { type: String, default: null },
    reference: { type: String, default: null },
    reason: { type: String, default: "" },
    ipAddress: { type: String, default: "Unknown" },
  },
  { timestamps: true }
);

// No pre/post update hooks needed for immutability - simply never expose a
// PATCH/PUT/DELETE route for this collection anywhere in the API.
financialAuditLogSchema.index({ user: 1, createdAt: -1 });
financialAuditLogSchema.index({ reference: 1 });

export default mongoose.model("FinancialAuditLog", financialAuditLogSchema);
