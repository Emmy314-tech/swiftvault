import {
  createPurchaseFingerprint,
  findExistingPurchase,
  idempotencyConflictResponse,
  validateIdempotencyKey,
} from "../services/purchaseIdempotency.js";

export const requirePurchaseIdempotency = (transactionType) => async (req, res, next) => {
  const key = req.get("Idempotency-Key");
  if (!validateIdempotencyKey(key)) {
    return res.status(400).json({ message: "A valid Idempotency-Key header is required." });
  }

  const purchaseDetails = { ...(req.body || {}) };
  delete purchaseDetails.pin;
  delete purchaseDetails.adminPin;
  const fingerprint = createPurchaseFingerprint(transactionType, purchaseDetails);
  try {
    const existing = await findExistingPurchase({ userId: req.user.id, idempotencyKey: key, fingerprint });
    const response = idempotencyConflictResponse(existing, fingerprint);
    if (response) return res.status(response.statusCode).json(response.body);

    req.purchaseIdempotency = { key, fingerprint };
    return next();
  } catch {
    return res.status(503).json({ message: "Could not safely check purchase idempotency. Retry with the same key." });
  }
};