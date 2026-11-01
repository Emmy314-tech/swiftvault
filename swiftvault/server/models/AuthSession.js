import mongoose from "mongoose";

const authSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tokenId: { type: String, required: true, immutable: true },
  expiresAt: { type: Date, required: true, immutable: true },
  ipAddress: { type: String, default: "Unknown", immutable: true },
  userAgent: { type: String, default: "Unknown", immutable: true },
  lastUsedAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null },
  revokeReason: {
    type: String,
    enum: ["logout", "password_reset", "phone_update", "remote_revoke"],
    default: null,
  },
}, { timestamps: true });

authSessionSchema.index({ tokenId: 1 }, { unique: true });
authSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: -1 });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("AuthSession", authSessionSchema);
