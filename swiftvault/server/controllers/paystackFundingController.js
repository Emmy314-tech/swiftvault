import crypto from "node:crypto";
import mongoose from "mongoose";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import { authenticateTransactionPin } from "../services/pinService.js";
import { getCredential } from "../services/settingsService.js";
import { createPaystackGateway, isPaystackLivePaymentsEnabled, nairaToKobo, verifyPaystackSignature } from "../services/paystackGateway.js";
import { settleVerifiedPaystackDedicatedTransfer, settleVerifiedPaystackPayment } from "../services/paystackFundingService.js";
import { applyPaystackDedicatedAccountEvent } from "../services/paystackDedicatedAccountService.js";
import { createWebhookLog, updateWebhookLog } from "../services/webhookLogService.js";
import { createPurchaseFingerprint, validateIdempotencyKey } from "../services/purchaseIdempotency.js";

const gateway = createPaystackGateway({ getSecretKey: () => getCredential("paystackSecretKey") });

const responseForSettlement = (outcome, res) => {
  if (outcome.result === "success") return res.json({ success: true, status: "success", reference: outcome.reference });
  if (outcome.result === "held") return res.json({ success: true, status: "held", message: "Payment received and held for review. Wallet was not credited." });
  if (outcome.result === "pending") return res.status(202).json({ success: true, status: "pending", message: "Payment is not yet confirmed." });
  if (outcome.result === "failed") return res.status(422).json({ success: false, status: "failed", message: "Payment was not successful." });
  if (outcome.result === "duplicate") {
    if (outcome.status === "failed") return res.status(422).json({ success: false, status: "failed", message: "Payment was not successful." });
    if (outcome.status === "held") return res.json({ success: true, status: "held", message: "Payment received and held for review. Wallet was not credited." });
    if (outcome.status === "success") return res.json({ success: true, status: "success", message: "Payment was already verified." });
    return res.status(202).json({ success: true, status: outcome.status || "processing" });
  }
  if (outcome.result === "invalid") return res.status(422).json({ success: false, status: "mismatch", message: "Verified payment did not match the pending funding request." });
  return res.status(404).json({ success: false, message: "Funding request not found." });
};

const callbackUrl = () => {
  const value = process.env.PAYSTACK_CALLBACK_URL;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("PAYSTACK_CALLBACK_URL must be configured with a valid URL.");
  }
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !localHttp) || parsed.username || parsed.password || parsed.hash) {
    throw new Error("PAYSTACK_CALLBACK_URL must use HTTPS except for localhost development.");
  }
  return parsed.toString();
};

const verifyAndSettle = async (reference) => {
  if (!isPaystackLivePaymentsEnabled()) {
    const error = new Error("Paystack payments are disabled by server configuration.");
    error.code = "PAYSTACK_DISABLED";
    throw error;
  }
  const payment = await gateway.verify(reference);
  return settleVerifiedPaystackPayment(payment, {}, reference);
};

const verifyAndSettleDedicatedTransfer = async (eventData) => {
  if (!isPaystackLivePaymentsEnabled()) {
    const error = new Error("Paystack payments are disabled by server configuration.");
    error.code = "PAYSTACK_DISABLED";
    throw error;
  }
  const payment = await gateway.verify(eventData.reference);
  const eventCustomerCode = eventData.customer?.customer_code || eventData.customer?.code;
  const paymentCustomerCode = payment.customer?.customer_code || payment.customer?.code;
  if (
    payment.reference !== eventData.reference ||
    payment.amount !== eventData.amount ||
    String(payment.currency || "").toUpperCase() !== String(eventData.currency || "").toUpperCase() ||
    payment.status !== "success" ||
    eventData.status !== "success" ||
    eventData.authorization?.channel !== "dedicated_nuban" ||
    payment.authorization?.channel !== "dedicated_nuban" ||
    (eventCustomerCode && eventCustomerCode !== paymentCustomerCode)
  ) return { result: "invalid", reason: "provider_event_mismatch" };
  return settleVerifiedPaystackDedicatedTransfer(payment);
};

export const initializePaystackFunding = async (req, res) => {
  if (!isPaystackLivePaymentsEnabled()) {
    return res.status(503).json({ success: false, code: "PAYSTACK_DISABLED", message: "Online wallet funding is temporarily unavailable." });
  }

  let amountKobo;
  try {
    amountKobo = nairaToKobo(req.body?.amount);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
  const maxAmount = Number(req.transactionPolicy?.tierPolicy?.maximumFundingPerTransaction);
  if (!Number.isFinite(maxAmount) || amountKobo / 100 > maxAmount) {
    return res.status(400).json({ success: false, code: "FUNDING_LIMIT_EXCEEDED", message: "Amount exceeds the approved per-transaction funding limit." });
  }

  const idempotencyKey = req.get("Idempotency-Key");
  if (!validateIdempotencyKey(idempotencyKey)) {
    return res.status(400).json({ success: false, message: "A valid Idempotency-Key header is required." });
  }
  const fingerprint = createPurchaseFingerprint("paystack_wallet_funding", { amount: amountKobo });
  const user = await User.findById(req.user.id);
  if (!user || user.isSuspended) return res.status(403).json({ success: false, message: "This account is not eligible for wallet funding." });
  const pinCheck = await authenticateTransactionPin(user, req.body?.pin);
  if (!pinCheck.ok) return res.status(pinCheck.status).json({ success: false, message: pinCheck.message });

  const prior = await Transaction.findOne({ userId: user._id, idempotencyKey })
    .select("reference status requestFingerprint provider +checkoutUrl");
  if (prior) {
    if (prior.requestFingerprint !== fingerprint) {
      return res.status(409).json({ success: false, message: "This idempotency key was already used for different funding details." });
    }
    if (prior.status === "pending" && prior.provider === "paystack" && prior.checkoutUrl) {
      return res.status(202).json({ success: true, status: "pending", reference: prior.reference, authorizationUrl: prior.checkoutUrl });
    }
    if (prior.status !== "pending" || prior.provider !== "paystack") return res.status(prior.status === "success" ? 200 : 422).json({
      success: prior.status === "success",
      status: prior.status,
      reference: prior.reference,
      message: "This funding request was already processed. Use a new request to try again.",
    });
  }

  try {
    const destination = callbackUrl();
    const amount = amountKobo / 100;
    const reference = prior?.reference || `SVP-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
    let funding = prior;
    if (!funding) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          [funding] = await Transaction.create([{
            userId: user._id,
            type: "wallet_funding",
            provider: "paystack",
            amount,
            expectedAmountKobo: amountKobo,
            fundingCurrency: "NGN",
            fundingEmail: user.email,
            idempotencyKey,
            requestFingerprint: fingerprint,
            description: "Paystack wallet funding",
            status: "pending",
            reference,
          }], { session });
        });
      } finally {
        await session.endSession();
      }
    }

    const initialized = await gateway.initialize({
      email: user.email,
      amountKobo,
      reference,
      callbackUrl: destination,
      metadata: { fundingId: String(funding._id), customerId: String(user._id) },
    });
    funding.checkoutUrl = initialized.authorizationUrl;
    await funding.save();
    return res.status(201).json({ success: true, status: "pending", reference, authorizationUrl: initialized.authorizationUrl });
  } catch (error) {
    console.error("Paystack initialization failed:", error.code || error.name || "provider_error");
    const status = error.code === "PAYSTACK_NOT_CONFIGURED" ? 503 : 502;
    return res.status(status).json({ success: false, code: error.code || "PAYSTACK_INITIALIZATION_FAILED", message: "Payment initialization could not be completed." });
  }
};

export const verifyPaystackFunding = async (req, res) => {
  const reference = typeof req.body?.reference === "string" ? req.body.reference.trim() : "";
  if (!reference) return res.status(400).json({ success: false, message: "Funding reference is required." });
  const funding = await Transaction.findOne({ reference, type: "wallet_funding", provider: "paystack", userId: req.user.id })
    .select("reference status");
  if (!funding) return res.status(404).json({ success: false, message: "Funding request not found." });
  if (funding.status !== "pending") return responseForSettlement({ result: "duplicate", status: funding.status }, res);

  try {
    const outcome = await verifyAndSettle(reference);
    return responseForSettlement({ ...outcome, reference }, res);
  } catch (error) {
    if (error.code === "PAYSTACK_DISABLED") return res.status(503).json({ success: false, code: error.code, message: "Online wallet funding is temporarily unavailable." });
    console.error("Paystack verification failed:", error.code || error.name || "provider_error");
    return res.status(503).json({ success: false, message: "Payment verification is temporarily unavailable." });
  }
};

export const getPaystackFundingStatus = async (_req, res) => {
  try {
    const secretConfigured = Boolean(await getCredential("paystackSecretKey"));
    return res.json({ configured: secretConfigured, enabled: isPaystackLivePaymentsEnabled() && secretConfigured });
  } catch {
    return res.json({ configured: false, enabled: false });
  }
};

export const createPaystackWebhookHandler = ({
  getSecretKey = () => getCredential("paystackSecretKey"),
  livePaymentsEnabled = isPaystackLivePaymentsEnabled,
  verifySignature = verifyPaystackSignature,
  createLog = createWebhookLog,
  updateLog = updateWebhookLog,
  findFunding = (reference) => Transaction.findOne({ reference, type: "wallet_funding", provider: "paystack" }).select("status"),
  verifyAndSettlePayment = verifyAndSettle,
  verifyAndSettleDedicatedPayment = verifyAndSettleDedicatedTransfer,
  applyDedicatedAccountEvent = applyPaystackDedicatedAccountEvent,
} = {}) => async (req, res) => {
  let webhookLogId = null;
  const signature = req.headers["x-paystack-signature"];
  const secretKey = await getSecretKey();
  const event = req.body;
  const reference = event?.data?.reference;
  const webhookLog = await createLog({
    provider: "paystack",
    eventType: event?.event,
    reference,
    headers: req.headers,
    payload: event,
    signatureValid: false,
  });
  webhookLogId = webhookLog?._id;

  if (!secretKey || !req.rawBody || !verifySignature(req.rawBody, signature, secretKey)) {
    await updateLog(webhookLogId, { processingStatus: "rejected", errorMessage: "Invalid Paystack signature or unavailable raw body" });
    return res.status(401).json({ message: "Unauthorized" });
  }
  await updateLog(webhookLogId, { signatureValid: true });

  if ([
    "customeridentification.success",
    "customeridentification.failed",
    "dedicatedaccount.assign.success",
    "dedicatedaccount.assign.failed",
  ].includes(event?.event)) {
    try {
      const result = await applyDedicatedAccountEvent(event);
      const processingStatus = ["updated", "ignored"].includes(result.result) ? "processed"
        : result.result === "incomplete" ? "received" : "failed";
      await updateLog(webhookLogId, { processingStatus, errorMessage: result.result === "unmatched" ? "No matching Paystack customer" : null });
      return res.status(200).json({ message: result.result === "updated" ? "Paystack account status updated" : "Acknowledged" });
    } catch (error) {
      await updateLog(webhookLogId, { processingStatus: "failed", errorMessage: error.code || error.name || "assignment_event_error" });
      return res.status(500).json({ message: "Paystack account status could not be updated." });
    }
  }

  if (["transfer.success", "transfer.failed", "transfer.reversed"].includes(event?.event)) {
    await updateLog(webhookLogId, {
      processingStatus: "held",
      errorMessage: "Paystack payout settlement is not configured; no wallet or company balance was changed.",
    });
    return res.status(200).json({ message: "Transfer event acknowledged; payout status unchanged." });
  }

  if (!livePaymentsEnabled()) {
    await updateLog(webhookLogId, { processingStatus: "rejected", errorMessage: "Paystack live payments are disabled" });
    return res.status(503).json({ message: "Paystack payments are disabled" });
  }
  if (!["charge.success", "charge.failed"].includes(event?.event) || typeof reference !== "string") {
    await updateLog(webhookLogId, { processingStatus: "processed" });
    return res.status(200).json({ message: "Acknowledged" });
  }


  if (event?.event === "charge.success" && event?.data?.authorization?.channel === "dedicated_nuban") {
    try {
      const outcome = await verifyAndSettleDedicatedPayment(event.data);
      const processingStatus = outcome.result === "success" ? "processed"
        : outcome.result === "held" ? "held"
          : outcome.result === "duplicate" ? "duplicate" : "failed";
      await updateLog(webhookLogId, { processingStatus });
      return res.status(200).json({ message: outcome.result === "held" ? "Payment received and held for review" : "Acknowledged" });
    } catch (error) {
      await updateLog(webhookLogId, { processingStatus: "failed", errorMessage: error.code || error.name || "verification_error" });
      console.error("Paystack DVA webhook verification failed:", error.code || error.name || "unclassified_error");
      return res.status(error.code === "PAYSTACK_DISABLED" ? 503 : 502).json({ message: "Payment verification is temporarily unavailable." });
    }
  }
  try {
    const existing = await findFunding(reference);
    if (!existing) {
      await updateLog(webhookLogId, { processingStatus: "failed", errorMessage: "No matching funding record" });
      return res.status(200).json({ message: "No matching funding request" });
    }
    if (existing.status !== "pending") {
      await updateLog(webhookLogId, { processingStatus: "duplicate" });
      return res.status(200).json({ message: "Already processed" });
    }

    const outcome = await verifyAndSettlePayment(reference);
    const logStatus = outcome.result === "success" ? "processed"
      : outcome.result === "held" ? "held"
        : outcome.result === "duplicate" ? "duplicate"
          : outcome.result === "pending" ? "received" : "failed";
    await updateLog(webhookLogId, { processingStatus: logStatus });
    return res.status(200).json({ message: outcome.result === "duplicate" ? "Already processed" : "Acknowledged" });
  } catch (error) {
    await updateLog(webhookLogId, { processingStatus: "failed", errorMessage: error.code || error.name || "verification_error" });
    console.error("Paystack webhook verification failed:", error.code || error.name || "unclassified_error");
    return res.status(error.code === "PAYSTACK_DISABLED" ? 503 : 502).json({ message: "Payment verification is temporarily unavailable." });
  }
};

export const paystackWebhook = createPaystackWebhookHandler();