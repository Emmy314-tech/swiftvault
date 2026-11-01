import crypto from "crypto";
import SecurityAuditEvent from "../models/SecurityAuditEvent.js";
import WebAuthnChallenge from "../models/WebAuthnChallenge.js";
import { sendNotification } from "./notificationService.js";

export const STEP_UP_ACTIONS = [
  "pin_change",
  "transfer",
  "bank_transfer",
  "service_purchase",
  "membership_purchase",
  "wallet_funding",
  "beneficiary_change",
  "admin_pin_change",
  "admin_withdrawal",
  "admin_balance_adjustment",
];

export const getWebAuthnConfig = () => {
  const rpID = process.env.WEBAUTHN_RP_ID?.trim();
  const origins = (process.env.WEBAUTHN_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!rpID || !/^[a-z0-9.-]+$/i.test(rpID) || !origins.length) return null;
  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      return null;
    }
    const rpHostMatch = parsed.hostname === rpID || parsed.hostname.endsWith(`.${rpID}`);
    if (!rpHostMatch || parsed.origin !== origin || (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1")) {
      return null;
    }
  }
  return { rpID, origins };
};

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => !["pin", "currentPin", "adminPin", "password", "otp"].includes(key))
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
};

export const hashRequestContext = (value = {}) =>
  crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");

export const hashSecret = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const consumeWebAuthnChallenge = ({ challenge, purpose, userId, sessionTokenId }) => {
  const filter = {
    challenge,
    purpose,
    expiresAt: { $gt: new Date() },
  };
  if (userId) filter.userId = userId;
  if (sessionTokenId) filter.sessionTokenId = sessionTokenId;
  return WebAuthnChallenge.findOneAndDelete(filter);
};

export const writeSecurityEvent = (req, userId, eventType, details = "") =>
  SecurityAuditEvent.create({
    userId,
    eventType,
    details,
    ipAddress: req.ip || "Unknown",
    userAgent: String(req.headers["user-agent"] || "Unknown").slice(0, 500),
  });

export const sendSecurityNotification = async (userId, message) => {
  try {
    await sendNotification({
      userId,
      title: "SwiftVault account security",
      message,
      type: "security",
      priority: "high",
      actionUrl: "/profile/devices",
    });
  } catch (error) {
    console.error("Security notification failed:", error.code || error.name || "unclassified_error");
  }
};
