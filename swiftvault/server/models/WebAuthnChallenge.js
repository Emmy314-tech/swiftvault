import mongoose from "mongoose";

const webAuthnChallengeSchema = new mongoose.Schema({
  challenge: { type: String, required: true, immutable: true },
  purpose: { type: String, enum: ["registration", "login", "step_up"], required: true, immutable: true },
  action: { type: String, default: null, immutable: true },
  contextHash: { type: String, default: null, immutable: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  sessionTokenId: { type: String, default: null, immutable: true },
  expiresAt: { type: Date, required: true, immutable: true },
}, { timestamps: true });

webAuthnChallengeSchema.index({ challenge: 1 }, { unique: true });
webAuthnChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("WebAuthnChallenge", webAuthnChallengeSchema);
