import mongoose from "mongoose";

const reconciliationAttemptSchema = new mongoose.Schema({
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", required: true },
  reference: { type: String, required: true },
  provider: { type: String, enum: ["monnify", "peyflex"], required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  mode: { type: String, enum: ["provider_query", "manual", "webhook"], required: true },
  requestedOutcome: { type: String, enum: ["success", "failed", "check"], default: "check" },
  observedStatus: { type: String, default: null },
  result: { type: String, enum: ["resolved", "pending", "already_settled", "error"], required: true },
  reason: { type: String, default: "" },
  ipAddress: { type: String, default: "Unknown" },
}, { timestamps: true });

reconciliationAttemptSchema.index({ transactionId: 1, createdAt: -1 });
reconciliationAttemptSchema.index({ reference: 1, createdAt: -1 });

export default mongoose.model("ReconciliationAttempt", reconciliationAttemptSchema);