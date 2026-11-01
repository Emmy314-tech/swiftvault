import crypto from "crypto";
import jwt from "jsonwebtoken";
import AuthSession from "../models/AuthSession.js";
import SecurityAuditEvent from "../models/SecurityAuditEvent.js";
import { sendSecurityNotification } from "./securityService.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SECURITY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const createAuthToken = async (user, req = null) => {
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const ipAddress = req?.ip || "Unknown";
  const userAgent = String(req?.headers?.["user-agent"] || "Unknown").slice(0, 500);
  const hasRequestContext = Boolean(req?.ip);
  let newLoginContext = false;
  if (hasRequestContext) {
    const [hasPriorSession, hasSeenContext] = await Promise.all([
      AuthSession.exists({ userId: user._id }),
      AuthSession.exists({ userId: user._id, ipAddress, userAgent }),
    ]);
    newLoginContext = Boolean(hasPriorSession && !hasSeenContext);
  }

  await AuthSession.create({
    userId: user._id,
    tokenId,
    expiresAt,
    ipAddress,
    userAgent,
  });

  if (newLoginContext) {
    const cooldownUntil = new Date(Date.now() + SECURITY_COOLDOWN_MS);
    await user.updateOne({ $max: { securityCooldownUntil: cooldownUntil } });
    await SecurityAuditEvent.create({
      userId: user._id,
      eventType: "login_context_new",
      details: "New login context; outgoing transaction cooldown applied.",
      ipAddress,
      userAgent,
    });
    await sendSecurityNotification(
      user._id,
      "A sign-in from a new device or network was detected. Outgoing transactions are restricted for 24 hours. If this was not you, reset your password and contact support."
    );
  }

  return jwt.sign({
    id: user._id,
    sessionId: tokenId,
    authTokenVersion: user.authTokenVersion || 0,
  }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

export const revokeUserSessions = (userId, reason, revokedAt = new Date()) =>
  AuthSession.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt, revokeReason: reason } }
  );
