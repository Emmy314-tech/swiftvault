import WebhookLog from "../models/WebhookLog.js";

const SENSITIVE_HEADERS = ["authorization", "cookie", "x-api-key", "x-paystack-signature"];
const SENSITIVE_PAYLOAD_KEYS = new Set([
  "account_number",
  "accountnumber",
  "bvn",
  "email",
  "first_name",
  "last_name",
  "middle_name",
  "phone",
  "sender_name",
  "sender_bank_account_number",
]);

function sanitizeHeaders(headers = {}) {
  const clean = {};
  for (const key of Object.keys(headers)) {
    clean[key] = SENSITIVE_HEADERS.includes(key.toLowerCase()) ? "[REDACTED]" : headers[key];
  }
  return clean;
}

const sanitizePayload = (value) => {
  if (Array.isArray(value)) return value.map(sanitizePayload);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_PAYLOAD_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : sanitizePayload(item),
  ]));
};

// Called immediately on webhook receipt, before any processing - guarantees a
// record exists even if something later throws.
export const createWebhookLog = async ({ provider = "paystack", eventType, reference, headers, payload, signatureValid }) => {
  try {
    return await WebhookLog.create({
      provider,
      eventType: eventType || null,
      reference: reference || null,
      headers: sanitizeHeaders(headers),
      payload: sanitizePayload(payload),
      signatureValid,
    });
  } catch (err) {
    console.error("Failed to create webhook log:", err.message);
    return null;
  }
};

// Called at each exit point of the webhook handler to update the same log entry.
export const updateWebhookLog = async (logId, { processingStatus, errorMessage, signatureValid }) => {
  if (!logId) return;
  try {
    await WebhookLog.findByIdAndUpdate(logId, {
      processingStatus,
      errorMessage: errorMessage || null,
      ...(signatureValid === undefined ? {} : { signatureValid }),
    });
  } catch (err) {
    console.error("Failed to update webhook log:", err.message);
  }
};
