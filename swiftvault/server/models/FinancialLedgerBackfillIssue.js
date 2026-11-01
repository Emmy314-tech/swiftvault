import mongoose from "mongoose";

const financialLedgerBackfillIssueSchema = new mongoose.Schema({
  sourceType: { type: String, required: true, immutable: true },
  sourceId: { type: String, required: true, immutable: true },
  reference: { type: String, default: null, immutable: true },
  reasonCode: { type: String, required: true, immutable: true },
  detail: { type: String, required: true, maxlength: 500, immutable: true },
  status: { type: String, enum: ["open", "resolved"], default: "open", required: true },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  resolutionReference: { type: String, default: null, maxlength: 200 },
}, { timestamps: true });

financialLedgerBackfillIssueSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true });
financialLedgerBackfillIssueSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model("FinancialLedgerBackfillIssue", financialLedgerBackfillIssueSchema);
