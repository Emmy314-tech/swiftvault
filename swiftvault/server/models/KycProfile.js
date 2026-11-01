import mongoose from "mongoose";

const checkStatus = ["not_started", "pending", "verified", "rejected", "action_required"];

const tierOneSchema = new mongoose.Schema({
  status: { type: String, enum: checkStatus, default: "not_started" },
  bvn: { type: String, enum: checkStatus, default: "not_started" },
  bvnNameMatch: { type: String, enum: checkStatus, default: "not_started" },
  dateOfBirthMatch: { type: String, enum: checkStatus, default: "not_started" },
  ninConsistency: { type: String, enum: checkStatus, default: "not_started" },
  faceLiveness: { type: String, enum: checkStatus, default: "not_started" },
  providerReference: { type: String, default: null, select: false },
  verifiedAt: { type: Date, default: null },
}, { _id: false });

const tierTwoSchema = new mongoose.Schema({
  status: { type: String, enum: checkStatus, default: "not_started" },
  nin: { type: String, enum: checkStatus, default: "not_started" },
  identityMatch: { type: String, enum: checkStatus, default: "not_started" },
  providerReference: { type: String, default: null, select: false },
  verifiedAt: { type: Date, default: null },
}, { _id: false });

const tierThreeSchema = new mongoose.Schema({
  status: { type: String, enum: checkStatus, default: "not_started" },
  address: { type: String, enum: checkStatus, default: "not_started" },
  supportingDocuments: { type: String, enum: checkStatus, default: "not_started" },
  manualReview: { type: String, enum: checkStatus, default: "not_started" },
  reviewReason: { type: String, default: null, maxlength: 500 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
}, { _id: false });

const kycProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  tier1: { type: tierOneSchema, default: () => ({}) },
  tier2: { type: tierTwoSchema, default: () => ({}) },
  tier3: { type: tierThreeSchema, default: () => ({}) },
}, { timestamps: true });

export default mongoose.model("KycProfile", kycProfileSchema);
