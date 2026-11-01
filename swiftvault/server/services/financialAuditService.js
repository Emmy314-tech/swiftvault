import FinancialAuditLog from "../models/FinancialAuditLog.js";

// Records an immutable audit entry. Called after a financial operation succeeds
// (or fails, for refunds/reversals), reusing balance values already computed by
// the calling controller rather than re-querying the database.
export const recordFinancialAudit = async ({
  user = null,
  admin = null,
  operationType,
  amount,
  balanceBefore,
  balanceAfter,
  source = "system",
  destination = null,
  reference = null,
  reason = "",
  req = null,
}) => {
  try {
    await FinancialAuditLog.create({
      user,
      admin,
      operationType,
      amount,
      balanceBefore,
      balanceAfter,
      source,
      destination,
      reference,
      reason,
      ipAddress: req?.ip || "Unknown",
    });
  } catch (err) {
    // Never let audit logging break the actual financial operation - log loudly instead
    console.error("Failed to record financial audit entry:", err.message);
  }
};
