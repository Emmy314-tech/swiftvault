import mongoose from "mongoose";

const financialLedgerControlSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "primary" },
  reportingStatus: {
    type: String,
    enum: ["uninitialized", "backfill_in_progress", "needs_review", "ready"],
    default: "uninitialized",
    required: true,
  },
  unresolvedSourceCount: { type: Number, default: 0, min: 0 },
  backfillStartedAt: { type: Date, default: null },
  backfillCompletedAt: { type: Date, default: null },
  approvalReference: { type: String, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

export default mongoose.model("FinancialLedgerControl", financialLedgerControlSchema);
