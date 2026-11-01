import crypto from "node:crypto";
import Transaction from "../models/Transaction.js";

export const createPurchaseFingerprint = (type, values) => {
  const canonicalValues = Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, String(value).trim()])
  );
  return crypto.createHash("sha256").update(JSON.stringify({ type, values: canonicalValues })).digest("hex");
};

export const findExistingPurchase = ({ userId, idempotencyKey, fingerprint, session = null }) => {
  let query = Transaction.findOne({
    userId,
    $or: [
      { idempotencyKey },
      { requestFingerprint: fingerprint, status: "pending" },
    ],
  }).sort({ createdAt: -1 });
  if (session) query = query.session(session);
  return query.select("reference type status requestFingerprint amount");
};

export const idempotencyConflictResponse = (transaction, fingerprint) => {
  if (!transaction) return null;
  if (transaction.requestFingerprint !== fingerprint) {
    return { statusCode: 409, body: { message: "This idempotency key was already used for different purchase details." } };
  }

  const statusCode = transaction.status === "pending" ? 202 : transaction.status === "failed" ? 422 : 200;
  return {
    statusCode,
    body: {
      success: transaction.status === "success",
      status: transaction.status,
      reference: transaction.reference,
      message: transaction.status === "pending"
        ? "This purchase is already being processed. Do not retry with a new key."
        : transaction.status === "failed"
          ? "This purchase request already failed. Start a new request to retry."
          : "This purchase request was already processed.",
    },
  };
};

export const validateIdempotencyKey = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(value);