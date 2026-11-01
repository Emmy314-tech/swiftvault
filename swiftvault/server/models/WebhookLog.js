import mongoose from "mongoose";

const webhookLogSchema = new mongoose.Schema(
  {
    provider: { type: String, default: "paystack" },
    eventType: { type: String, default: null },
    reference: { type: String, default: null },
    headers: { type: mongoose.Schema.Types.Mixed, default: {} }, // sensitive headers stripped before storing
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    signatureValid: { type: Boolean, default: null }, // null = no signature configured to check against
    processingStatus: {
      type: String,
      enum: ["received", "duplicate", "processed", "failed", "rejected", "held"],
      default: "received",
    },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

webhookLogSchema.index({ reference: 1 });
webhookLogSchema.index({ createdAt: -1 });

export default mongoose.model("WebhookLog", webhookLogSchema);
