import mongoose from "mongoose";

const adminActivityLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    adminName: { type: String, required: true },
    action: { type: String, required: true }, // e.g. "user_suspended", "wallet_adjusted", "pricing_updated"
    description: { type: String, required: true },
    ipAddress: { type: String, default: "Unknown" },
    userAgent: { type: String, default: "Unknown" },
  },
  { timestamps: true }
);

// Frequently queried by admin and by action for filtering/search
adminActivityLogSchema.index({ adminId: 1, createdAt: -1 });
adminActivityLogSchema.index({ action: 1 });

export default mongoose.model("AdminActivityLog", adminActivityLogSchema);
