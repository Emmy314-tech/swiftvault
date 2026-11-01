import assert from "node:assert/strict";
import test from "node:test";
import PasskeyCredential from "../models/PasskeyCredential.js";
import AuthSession from "../models/AuthSession.js";
import Notification from "../models/Notification.js";
import SecurityAuditEvent from "../models/SecurityAuditEvent.js";
import StepUpGrant from "../models/StepUpGrant.js";
import WebAuthnChallenge from "../models/WebAuthnChallenge.js";
import { requireOutgoingSecurityCooldownCleared, requireStepUp } from "../middleware/securityGuards.js";
import { createAuthToken } from "../services/authSessionService.js";
import {
  consumeWebAuthnChallenge,
  getWebAuthnConfig,
  hashRequestContext,
  hashSecret,
} from "../services/securityService.js";

test("passkey and one-time challenge records have unique and expiry indexes", () => {
  assert.ok(PasskeyCredential.schema.indexes().some(([keys, options]) => keys.credentialId === 1 && options.unique));
  assert.ok(WebAuthnChallenge.schema.indexes().some(([keys, options]) => keys.challenge === 1 && options.unique));
  assert.ok(WebAuthnChallenge.schema.indexes().some(([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0));
  assert.ok(StepUpGrant.schema.indexes().some(([keys, options]) => keys.tokenHash === 1 && options.unique));
  assert.ok(StepUpGrant.schema.indexes().some(([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0));
});

test("WebAuthn configuration accepts only exact HTTPS origins and an RP ID", (context) => {
  const previousRpId = process.env.WEBAUTHN_RP_ID;
  const previousOrigins = process.env.WEBAUTHN_ORIGINS;
  context.after(() => {
    if (previousRpId === undefined) delete process.env.WEBAUTHN_RP_ID;
    else process.env.WEBAUTHN_RP_ID = previousRpId;
    if (previousOrigins === undefined) delete process.env.WEBAUTHN_ORIGINS;
    else process.env.WEBAUTHN_ORIGINS = previousOrigins;
  });

  process.env.WEBAUTHN_RP_ID = "swiftvault.example";
  process.env.WEBAUTHN_ORIGINS = "https://swiftvault.example,https://app.swiftvault.example";
  assert.deepEqual(getWebAuthnConfig(), {
    rpID: "swiftvault.example",
    origins: ["https://swiftvault.example", "https://app.swiftvault.example"],
  });
  process.env.WEBAUTHN_ORIGINS = "https://swiftvault.example/path";
  assert.equal(getWebAuthnConfig(), null);
  process.env.WEBAUTHN_ORIGINS = "https://malicious.example";
  assert.equal(getWebAuthnConfig(), null);
  delete process.env.WEBAUTHN_RP_ID;
  assert.equal(getWebAuthnConfig(), null);
});

test("a new login context stores session metadata and applies the selected cooldown", async (context) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-session-secret";
  context.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  let session;
  let cooldownUpdate;
  let auditEvent;
  context.mock.method(AuthSession, "exists", async (filter) => !("ipAddress" in filter));
  context.mock.method(AuthSession, "create", async (record) => { session = record; });
  context.mock.method(SecurityAuditEvent, "create", async (record) => { auditEvent = record; });
  context.mock.method(Notification, "create", async (record) => record);
  const user = {
    _id: "user-id",
    authTokenVersion: 0,
    updateOne: async (update) => { cooldownUpdate = update; },
  };

  await createAuthToken(user, {
    ip: "192.0.2.1",
    headers: { "user-agent": "SwiftVault test browser" },
  });
  assert.equal(session.ipAddress, "192.0.2.1");
  assert.equal(session.userAgent, "SwiftVault test browser");
  assert.ok(cooldownUpdate.$max.securityCooldownUntil > new Date(Date.now() + 23 * 60 * 60 * 1000));
  assert.equal(auditEvent.eventType, "login_context_new");
});

test("action contexts bind request data while excluding PIN and password secrets", () => {
  assert.equal(
    hashRequestContext({ body: { amount: 125, pin: "1234", currentPin: "4321" }, params: {} }),
    hashRequestContext({ body: { currentPin: "9999", pin: "0000", amount: 125 }, params: {} })
  );
  assert.notEqual(
    hashRequestContext({ body: { amount: 125 }, params: {} }),
    hashRequestContext({ body: { amount: 126 }, params: {} })
  );
  assert.notEqual(hashSecret("first"), hashSecret("second"));
});

test("an authenticator challenge can be consumed only once", async (context) => {
  let consumed = false;
  let capturedFilter;
  context.mock.method(WebAuthnChallenge, "findOneAndDelete", async (filter) => {
    capturedFilter = filter;
    if (consumed) return null;
    consumed = true;
    return { challenge: "single-use-challenge" };
  });

  const input = {
    challenge: "single-use-challenge",
    purpose: "step_up",
    userId: "user-id",
    sessionTokenId: "session-id",
  };
  const results = await Promise.all([
    consumeWebAuthnChallenge(input),
    consumeWebAuthnChallenge(input),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(capturedFilter.userId, input.userId);
  assert.equal(capturedFilter.sessionTokenId, input.sessionTokenId);
  assert.ok(capturedFilter.expiresAt.$gt instanceof Date);
});

test("step-up grants are bound to user, session, action and exact request context, and consumed once", async (context) => {
  let query;
  let allow = true;
  context.mock.method(StepUpGrant, "findOneAndUpdate", async (filter) => {
    query = filter;
    if (!allow) return null;
    allow = false;
    return { _id: "grant-id" };
  });

  const req = {
    body: { amount: 125, pin: "0000" },
    params: {},
    user: { _id: "user-id" },
    authSession: { tokenId: "session-id" },
    get: () => "one-time-grant",
  };
  let nextCalls = 0;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const next = () => { nextCalls += 1; };
  const middleware = requireStepUp("transfer");

  await middleware(req, res, next);
  assert.equal(nextCalls, 1);
  assert.equal(query.tokenHash, hashSecret("one-time-grant"));
  assert.equal(query.userId, "user-id");
  assert.equal(query.sessionTokenId, "session-id");
  assert.equal(query.action, "transfer");
  assert.equal(query.contextHash, hashRequestContext({ body: req.body, params: {} }));
  assert.equal(query.consumedAt, null);
  assert.ok(query.expiresAt.$gt instanceof Date);

  await middleware(req, res, next);
  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "STEP_UP_INVALID");
});

test("outgoing actions are blocked until the recovery or new-context cooldown expires", () => {
  const now = new Date();
  const req = { user: { securityCooldownUntil: new Date(now.getTime() + 60_000) } };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextCalls = 0;

  requireOutgoingSecurityCooldownCleared(req, res, () => { nextCalls += 1; });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "SECURITY_COOLDOWN_ACTIVE");
  req.user.securityCooldownUntil = new Date(now.getTime() - 1);
  requireOutgoingSecurityCooldownCleared(req, res, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
});
