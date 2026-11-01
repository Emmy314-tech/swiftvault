import mongoose from "mongoose";

const kycAuditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, enum: ["tier3_approved", "tier3_rejected", "tier3_action_required"], required: true },
  reason: { type: String, required: true, maxlength: 500 },
  evidenceReference: { type: String, required: true, maxlength: 200 },
}, { timestamps: true });

kycAuditLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("KycAuditLog", kycAuditLogSchema);
