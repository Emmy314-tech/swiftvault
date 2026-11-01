import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import AuthSession from "../models/AuthSession.js";
import PasskeyCredential from "../models/PasskeyCredential.js";
import SecurityAuditEvent from "../models/SecurityAuditEvent.js";
import StepUpGrant from "../models/StepUpGrant.js";
import User from "../models/User.js";
import WebAuthnChallenge from "../models/WebAuthnChallenge.js";
import { createAuthToken } from "../services/authSessionService.js";
import {
  getWebAuthnConfig,
  consumeWebAuthnChallenge,
  hashRequestContext,
  hashSecret,
  sendSecurityNotification,
  STEP_UP_ACTIONS,
  writeSecurityEvent,
} from "../services/securityService.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const GRANT_TTL_MS = 2 * 60 * 1000;

const unavailable = (res) => res.status(503).json({
  success: false,
  code: "PASSKEY_CONFIGURATION_REQUIRED",
  message: "Passkey security is unavailable until the relying-party ID and allowed origins are configured.",
});

const safeUser = (user) => ({
  fullName: user.fullName,
  username: user.username,
  email: user.email,
  phone: user.phone,
  role: user.role,
  tier: user.tier || "normal",
  isUpgraded: user.isUpgraded === true,
});

const getChallenge = (response) => {
  const encoded = response?.response?.clientDataJSON;
  if (typeof encoded !== "string" || encoded.length > 20000) return null;
  try {
    const data = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return typeof data.challenge === "string" ? data.challenge : null;
  } catch {
    return null;
  }
};

const validateActionRequest = (action, request) => {
  if (!STEP_UP_ACTIONS.includes(action)) return false;
  if (!request || typeof request !== "object" || Array.isArray(request)) return false;
  return JSON.stringify(request).length <= 20000;
};

const createStepUpGrant = async ({ userId, sessionTokenId, action, contextHash }) => {
  const token = crypto.randomBytes(32).toString("base64url");
  await StepUpGrant.create({
    userId,
    sessionTokenId,
    action,
    contextHash,
    tokenHash: hashSecret(token),
    expiresAt: new Date(Date.now() + GRANT_TTL_MS),
  });
  return { token, expiresAt: new Date(Date.now() + GRANT_TTL_MS) };
};

export const beginPasskeyLogin = async (req, res) => {
  const config = getWebAuthnConfig();
  if (!config) return unavailable(res);

  try {
    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      userVerification: "required",
      timeout: 60000,
    });
    await WebAuthnChallenge.create({
      challenge: options.challenge,
      purpose: "login",
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
    return res.json({ success: true, options });
  } catch (error) {
    console.error("Passkey login options failed:", error.code || error.name || "unclassified_error");
    return res.status(503).json({ success: false, message: "Passkey sign-in is temporarily unavailable." });
  }
};

export const finishPasskeyLogin = async (req, res) => {
  const config = getWebAuthnConfig();
  if (!config) return unavailable(res);

  try {
    const response = req.body?.response;
    const challenge = getChallenge(response);
    if (!challenge || typeof response?.id !== "string") {
      return res.status(400).json({ success: false, message: "Invalid passkey response." });
    }

    const storedChallenge = await consumeWebAuthnChallenge({
      challenge,
      purpose: "login",
    });
    if (!storedChallenge) {
      return res.status(401).json({ success: false, message: "Passkey challenge is expired or has already been used." });
    }

    const credential = await PasskeyCredential.findOne({
      credentialId: response.id,
      revokedAt: null,
    }).select("+publicKey");
    if (!credential) return res.status(401).json({ success: false, message: "Passkey could not be verified." });
    const user = await User.findById(credential.userId);
    if (!user || user.isSuspended || !user.phoneVerified) {
      return res.status(403).json({ success: false, message: "This account cannot sign in." });
    }
    if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
      return res.status(423).json({ success: false, message: "This account is temporarily locked. Try again later." });
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: storedChallenge.challenge,
        expectedOrigin: config.origins,
        expectedRPID: config.rpID,
        requireUserVerification: true,
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(credential.publicKey),
          counter: credential.counter,
          transports: credential.transports,
        },
      });
    } catch (error) {
      console.warn("Passkey login assertion rejected:", error.name || "verification_error");
      return res.status(401).json({ success: false, message: "Passkey could not be verified." });
    }
    if (!verification.verified) return res.status(401).json({ success: false, message: "Passkey could not be verified." });

    const counterResult = await PasskeyCredential.updateOne({
      _id: credential._id,
      counter: credential.counter,
      revokedAt: null,
    }, {
      $set: {
        counter: verification.authenticationInfo.newCounter,
        backedUp: verification.authenticationInfo.credentialBackedUp,
        lastUsedAt: new Date(),
      },
    });
    if (counterResult.modifiedCount !== 1) {
      return res.status(401).json({ success: false, message: "Passkey was concurrently used, revoked, or changed. Try again." });
    }

    if (user.loginAttempts > 0 || user.loginLockedUntil) {
      user.loginAttempts = 0;
      user.loginLockedUntil = null;
      await user.save();
    }
    const token = await createAuthToken(user, req);
    await writeSecurityEvent(req, user._id, "passkey_login", "Passkey authentication succeeded.");
    return res.json({ success: true, message: "Passkey sign-in successful.", token, user: safeUser(user) });
  } catch (error) {
    console.error("Passkey login verification failed:", error.code || error.name || "unclassified_error");
    return res.status(503).json({ success: false, message: "Passkey sign-in is temporarily unavailable." });
  }
};

export const beginPasskeyRegistration = async (req, res) => {
  const config = getWebAuthnConfig();
  if (!config) return unavailable(res);

  try {
    const { password, deviceName } = req.body ?? {};
    if (typeof password !== "string" || !deviceName || String(deviceName).trim().length > 60) {
      return res.status(400).json({ success: false, message: "Current password and a device name of at most 60 characters are required." });
    }
    const user = await User.findById(req.user._id);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: "Current password is incorrect." });
    }

    const existing = await PasskeyCredential.find({ userId: user._id, revokedAt: null });
    const options = await generateRegistrationOptions({
      rpName: "SwiftVault",
      rpID: config.rpID,
      userID: Buffer.from(String(user._id)),
      userName: user.username || user.email || String(user._id),
      userDisplayName: user.fullName || user.username || "SwiftVault customer",
      timeout: 60000,
      attestationType: "none",
      excludeCredentials: existing.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports,
      })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });

    await WebAuthnChallenge.create({
      challenge: options.challenge,
      purpose: "registration",
      userId: user._id,
      sessionTokenId: req.authSession.tokenId,
      action: String(deviceName).trim(),
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
    return res.json({ success: true, options });
  } catch (error) {
    console.error("Passkey registration options failed:", error.code || error.name || "unclassified_error");
    return res.status(503).json({ success: false, message: "Passkey registration could not be started." });
  }
};

export const finishPasskeyRegistration = async (req, res) => {
  const config = getWebAuthnConfig();
  if (!config) return unavailable(res);

  try {
    const response = req.body?.response;
    const challenge = getChallenge(response);
    if (!challenge) return res.status(400).json({ success: false, message: "Invalid passkey response." });

    const storedChallenge = await consumeWebAuthnChallenge({
      challenge,
      purpose: "registration",
      userId: req.user._id,
      sessionTokenId: req.authSession.tokenId,
    });
    if (!storedChallenge) {
      return res.status(401).json({ success: false, message: "Passkey challenge is expired or has already been used." });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: storedChallenge.challenge,
        expectedOrigin: config.origins,
        expectedRPID: config.rpID,
        requireUserVerification: true,
      });
    } catch (error) {
      console.warn("Passkey registration attestation rejected:", error.name || "verification_error");
      return res.status(401).json({ success: false, message: "Passkey registration could not be verified." });
    }
    if (!verification.verified) return res.status(401).json({ success: false, message: "Passkey registration could not be verified." });

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    await PasskeyCredential.create({
      userId: req.user._id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports || [],
      deviceName: storedChallenge.action,
      credentialDeviceType,
      backedUp: credentialBackedUp,
    });
    await writeSecurityEvent(req, req.user._id, "passkey_registered", "A passkey was added to the account.");
    return res.json({ success: true, message: "Passkey added successfully." });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This passkey is already registered." });
    console.error("Passkey registration verification failed:", error.code || error.name || "unclassified_error");
    return res.status(503).json({ success: false, message: "Passkey registration could not be completed." });
  }
};

export const listSecurityDevices = async (req, res) => {
  try {
    const [sessions, passkeys, events] = await Promise.all([
      AuthSession.find({
        userId: req.user._id,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }).select("tokenId ipAddress userAgent createdAt lastUsedAt expiresAt").sort({ lastUsedAt: -1 }).lean(),
      PasskeyCredential.find({ userId: req.user._id, revokedAt: null })
        .select("deviceName credentialDeviceType backedUp createdAt lastUsedAt").sort({ createdAt: -1 }).lean(),
      SecurityAuditEvent.find({ userId: req.user._id })
        .select("eventType details ipAddress createdAt").sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    return res.json({
      sessions: sessions.map((session) => ({ ...session, current: session.tokenId === req.authSession.tokenId })),
      passkeys,
      events,
      cooldownUntil: req.user.securityCooldownUntil || null,
    });
  } catch (error) {
    console.error("Security device listing failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ success: false, message: "Security devices could not be loaded." });
  }
};

export const revokePasskey = async (req, res) => {
  try {
    const result = await PasskeyCredential.updateOne({
      _id: req.params.id,
      userId: req.user._id,
      revokedAt: null,
    }, { $set: { revokedAt: new Date() } });
    if (result.modifiedCount !== 1) return res.status(404).json({ success: false, message: "Active passkey not found." });
    await User.updateOne({ _id: req.user._id }, {
      $max: { securityCooldownUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    await writeSecurityEvent(req, req.user._id, "passkey_revoked", "A passkey was revoked.");
    await sendSecurityNotification(
      req.user._id,
      "A passkey was revoked. Outgoing transactions are restricted for 24 hours. If this was not you, reset your password and contact support."
    );
    return res.json({ success: true, message: "Passkey revoked. Outgoing transactions are restricted for 24 hours." });
  } catch (error) {
    console.error("Passkey revocation failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ success: false, message: "Passkey could not be revoked." });
  }
};

export const revokeSession = async (req, res) => {
  try {
    const result = await AuthSession.updateOne({
      tokenId: req.params.tokenId,
      userId: req.user._id,
      revokedAt: null,
    }, { $set: { revokedAt: new Date(), revokeReason: "remote_revoke" } });
    if (result.modifiedCount !== 1) return res.status(404).json({ success: false, message: "Active session not found." });
    await writeSecurityEvent(req, req.user._id, "session_revoked", "An authenticated session was remotely revoked.");
    return res.json({ success: true, message: "Session revoked." });
  } catch (error) {
    console.error("Session revocation failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ success: false, message: "Session could not be revoked." });
  }
};

export const createPasswordStepUp = async (req, res) => {
  try {
    const { password, action, request } = req.body ?? {};
    if (!validateActionRequest(action, request) || typeof password !== "string") {
      return res.status(400).json({ success: false, message: "A valid action, request details and current password are required." });
    }
    const user = await User.findById(req.user._id);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: "Current password is incorrect." });
    }
    const grant = await createStepUpGrant({
      userId: req.user._id,
      sessionTokenId: req.authSession.tokenId,
      action,
      contextHash: hashRequestContext(request),
    });
    await writeSecurityEvent(req, req.user._id, "step_up_password", `Password verification authorized ${action}.`);
    return res.json({ success: true, ...grant });
  } catch (error) {
    console.error("Password step-up failed:", error.code || error.name || "unclassified_error");
    return res.status(503).json({ success: false, message: "Sensitive-action verification is unavailable." });
  }
};

export const beginPasskeyStepUp = async (req, res) => {
  const config = getWebAuthnConfig();
  if (!config) return unavailable(res);
  const { action, request } = req.body ?? {};
  if (!validateActionRequest(action, request)) {
    return res.status(400).json({ success: false, message: "A valid action and request details are required." });
  }

  try {
    const credentials = await PasskeyCredential.find({ userId: req.user._id, revokedAt: null });
    if (!credentials.length) return res.status(409).json({ success: false, message: "Register a passkey before using passkey verification." });
    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      userVerification: "required",
      timeout: 60000,
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports,
      })),
    });
    await WebAuthnChallenge.create({
      challenge: options.challenge,
      purpose: "step_up",
      userId: req.user._id,
      sessionTokenId: req.authSession.tokenId,
      action,
      contextHash: hashRequestContext(request),
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
    return res.json({ success: true, options });
  } catch (error) {
    console.error("Passkey step-up options failed:", error.code || error.name || "unclassified_error");
    return res.status(503).json({ success: false, message: "Passkey verification could not be started." });
  }
};

export const finishPasskeyStepUp = async (req, res) => {
  const config = getWebAuthnConfig();
  if (!config) return unavailable(res);

  try {
    const response = req.body?.response;
    const challenge = getChallenge(response);
    if (!challenge) return res.status(400).json({ success: false, message: "Invalid passkey response." });
    const storedChallenge = await consumeWebAuthnChallenge({
      challenge,
      purpose: "step_up",
      userId: req.user._id,
      sessionTokenId: req.authSession.tokenId,
    });
    if (!storedChallenge) return res.status(401).json({ success: false, message: "Passkey challenge is expired or has already been used." });

    const credential = await PasskeyCredential.findOne({
      credentialId: response.id,
      userId: req.user._id,
      revokedAt: null,
    }).select("+publicKey");
    if (!credential) return res.status(401).json({ success: false, message: "Passkey could not be verified." });
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: storedChallenge.challenge,
        expectedOrigin: config.origins,
        expectedRPID: config.rpID,
        requireUserVerification: true,
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(credential.publicKey),
          counter: credential.counter,
          transports: credential.transports,
        },
      });
    } catch (error) {
      console.warn("Passkey step-up assertion rejected:", error.name || "verification_error");
      return res.status(401).json({ success: false, message: "Passkey could not be verified." });
    }
    if (!verification.verified) return res.status(401).json({ success: false, message: "Passkey could not be verified." });
    const counterResult = await PasskeyCredential.updateOne({
      _id: credential._id,
      counter: credential.counter,
      revokedAt: null,
    }, {
      $set: {
        counter: verification.authenticationInfo.newCounter,
        backedUp: verification.authenticationInfo.credentialBackedUp,
        lastUsedAt: new Date(),
      },
    });
    if (counterResult.modifiedCount !== 1) return res.status(401).json({ success: false, message: "Passkey was concurrently used, revoked, or changed. Try again." });

    const grant = await createStepUpGrant({
      userId: req.user._id,
      sessionTokenId: req.authSession.tokenId,
      action: storedChallenge.action,
      contextHash: storedChallenge.contextHash,
    });
    await writeSecurityEvent(req, req.user._id, "step_up_verified", `Passkey verification authorized ${storedChallenge.action}.`);
    return res.json({ success: true, ...grant });
  } catch (error) {
    console.error("Passkey step-up verification failed:", error.code || error.name || "unclassified_error");
    return res.status(503).json({ success: false, message: "Passkey verification is temporarily unavailable." });
  }
};
