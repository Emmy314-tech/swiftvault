import mongoose from "mongoose";

const beneficiarySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Compound index so a user can't have duplicate phone entries in their list
beneficiarySchema.index({ userId: 1, phone: 1 }, { unique: true });

export default mongoose.model("Beneficiary", beneficiarySchema);

