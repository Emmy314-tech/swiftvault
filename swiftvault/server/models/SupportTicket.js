import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  authorType: { type: String, enum: ["customer", "admin"], required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  body: { type: String, required: true, trim: true, maxlength: 4000 },
  createdAt: { type: Date, default: Date.now },
});

const statusEventSchema = new mongoose.Schema({
  status: { type: String, enum: ["open", "in_review", "resolved", "closed"], required: true },
  actorType: { type: String, enum: ["customer", "admin"], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

const supportTicketSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  category: {
    type: String,
    enum: ["account", "transaction", "payment", "service", "security", "complaint", "other"],
    required: true,
  },
  subject: { type: String, required: true, trim: true, minlength: 5, maxlength: 120 },
  reference: { type: String, default: null, trim: true, maxlength: 120 },
  status: {
    type: String,
    enum: ["open", "in_review", "resolved", "closed"],
    default: "open",
  },
  messages: { type: [messageSchema], required: true, validate: (messages) => messages.length > 0 },
  statusHistory: { type: [statusEventSchema], default: [] },
}, { timestamps: true });

supportTicketSchema.index({ userId: 1, updatedAt: -1 });
supportTicketSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.model("SupportTicket", supportTicketSchema);
