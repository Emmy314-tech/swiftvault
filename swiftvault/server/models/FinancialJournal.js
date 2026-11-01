import mongoose from "mongoose";

const lineSchema = new mongoose.Schema({
  account: { type: String, required: true, trim: true },
  debit: { type: Number, required: true, min: 0 },
  credit: { type: Number, required: true, min: 0 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { _id: false });

const financialJournalSchema = new mongoose.Schema({
  idempotencyKey: { type: String, required: true, immutable: true },
  fingerprint: { type: String, required: true, immutable: true, select: false },
  sourceType: { type: String, required: true, immutable: true },
  serviceType: { type: String, default: null, immutable: true },
  sourceId: { type: String, required: true, immutable: true },
  sourceReference: { type: String, default: null, immutable: true },
  category: {
    type: String,
    required: true,
    immutable: true,
    enum: [
      "wallet_funding", "funding_suspense", "membership_revenue", "service_revenue",
      "provider_commission", "provider_commission_settlement",
      "transfer_fee", "referral_bonus", "provider_cost", "provider_fee",
      "welcome_bonus", "promotional_reserve_funding",
      "operating_expense", "refund", "customer_transfer", "pending_service",
      "pending_transfer", "admin_adjustment", "company_withdrawal",
      "payment_processor_fee", "hosting", "maintenance", "chargeback", "other_expense",
    ],
  },
  description: { type: String, required: true, maxlength: 500, immutable: true },
  evidenceReference: { type: String, default: null, maxlength: 200, immutable: true },
  sourceStatus: { type: String, default: "success", immutable: true },
  currency: { type: String, required: true, enum: ["NGN"], immutable: true },
  occurredAt: { type: Date, required: true, immutable: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  counterpartyUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  sourceTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", default: null, immutable: true },
  reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: "FinancialJournal", default: null, immutable: true },
  settlesJournal: { type: mongoose.Schema.Types.ObjectId, ref: "FinancialJournal", default: null, immutable: true },
  lines: {
    type: [lineSchema],
    required: true,
    immutable: true,
    validate: {
      validator(lines) {
        if (!Array.isArray(lines) || lines.length < 2) return false;
        let debitMinor = 0;
        let creditMinor = 0;
        for (const line of lines) {
          const debit = Math.round(Number(line.debit) * 100);
          const credit = Math.round(Number(line.credit) * 100);
          if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) return false;
          if ((debit > 0) === (credit > 0)) return false;
          debitMinor += debit;
          creditMinor += credit;
        }
        return debitMinor === creditMinor && debitMinor > 0;
      },
      message: "Financial journal lines must be positive, one-sided, and balanced to the cent.",
    },
  },
}, { timestamps: true, strict: "throw" });

financialJournalSchema.index({ idempotencyKey: 1 }, { unique: true });
financialJournalSchema.index(
  { reversalOf: 1 },
  {
    name: "unique_financial_journal_reversal",
    unique: true,
    partialFilterExpression: { reversalOf: { $type: "objectId" } },
  }
);
financialJournalSchema.index(
  { settlesJournal: 1 },
  {
    name: "unique_provider_commission_settlement",
    unique: true,
    partialFilterExpression: { settlesJournal: { $type: "objectId" } },
  }
);
financialJournalSchema.index({ occurredAt: -1, category: 1 });
financialJournalSchema.index({ sourceReference: 1 });
financialJournalSchema.index({ sourceTransactionId: 1 });
financialJournalSchema.index({ "lines.account": 1, occurredAt: -1 });
financialJournalSchema.index({ userId: 1, occurredAt: -1 });

financialJournalSchema.pre("save", function preventJournalMutation(next) {
  if (!this.isNew) return next(new Error("Financial journals are append-only; post a reversal instead."));
  next();
});
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete", "findOneAndReplace"]) {
  financialJournalSchema.pre(operation, function preventJournalQueryMutation(next) {
    next(new Error("Financial journals are append-only; post a reversal instead."));
  });
}

export default mongoose.model("FinancialJournal", financialJournalSchema);
