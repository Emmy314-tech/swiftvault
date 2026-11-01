import mongoose from "mongoose";

const securityAuditEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  eventType: {
    type: String,
    enum: [
      "login_context_new",
      "password_recovered",
      "passkey_registered",
      "passkey_revoked",
      "passkey_login",
      "session_revoked",
      "step_up_verified",
      "step_up_password",
    ],
    required: true,
    immutable: true,
  },
  details: { type: String, default: "", maxlength: 300, immutable: true },
  ipAddress: { type: String, default: "Unknown", immutable: true },
  userAgent: { type: String, default: "Unknown", maxlength: 500, immutable: true },
}, { timestamps: true });

securityAuditEventSchema.index({ userId: 1, createdAt: -1 });
securityAuditEventSchema.pre("save", function preventSecurityEventMutation(next) {
  if (!this.isNew) return next(new Error("Security audit events are append-only."));
  next();
});
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete", "findOneAndReplace"]) {
  securityAuditEventSchema.pre(operation, function preventSecurityEventQueryMutation(next) {
    next(new Error("Security audit events are append-only."));
  });
}

export default mongoose.model("SecurityAuditEvent", securityAuditEventSchema);
