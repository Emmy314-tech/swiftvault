import mongoose from "mongoose";

const stepUpGrantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  sessionTokenId: { type: String, required: true, immutable: true },
  action: {
    type: String,
    enum: ["pin_change", "transfer", "bank_transfer", "service_purchase", "membership_purchase", "wallet_funding", "beneficiary_change"],
    required: true,
    immutable: true,
  },
  contextHash: { type: String, required: true, immutable: true },
  tokenHash: { type: String, required: true, immutable: true },
  expiresAt: { type: Date, required: true, immutable: true },
  consumedAt: { type: Date, default: null },
}, { timestamps: true });

stepUpGrantSchema.index({ tokenHash: 1 }, { unique: true });
stepUpGrantSchema.index({ userId: 1, action: 1, expiresAt: -1 });
stepUpGrantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("StepUpGrant", stepUpGrantSchema);
