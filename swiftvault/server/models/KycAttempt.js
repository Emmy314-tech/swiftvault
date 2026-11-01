import mongoose from "mongoose";

const kycAttemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  requestedTier: { type: Number, enum: [1, 2, 3], required: true },
  status: { type: String, enum: ["blocked"], required: true, default: "blocked" },
  reasonCode: { type: String, required: true, enum: ["provider_unconfigured", "requirements_unconfigured"] },
}, { timestamps: true });

kycAttemptSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("KycAttempt", kycAttemptSchema);
