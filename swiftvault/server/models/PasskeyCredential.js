import mongoose from "mongoose";

const passkeyCredentialSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  credentialId: { type: String, required: true, immutable: true },
  publicKey: { type: Buffer, required: true, immutable: true, select: false },
  counter: { type: Number, required: true, min: 0 },
  transports: { type: [String], default: [] },
  deviceName: { type: String, required: true, trim: true, maxlength: 60 },
  credentialDeviceType: { type: String, enum: ["singleDevice", "multiDevice"], required: true },
  backedUp: { type: Boolean, required: true, default: false },
  createdAt: { type: Date, default: Date.now, immutable: true },
  lastUsedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: false });

passkeyCredentialSchema.index({ credentialId: 1 }, { unique: true });
passkeyCredentialSchema.index({ userId: 1, revokedAt: 1, createdAt: -1 });

export default mongoose.model("PasskeyCredential", passkeyCredentialSchema);
