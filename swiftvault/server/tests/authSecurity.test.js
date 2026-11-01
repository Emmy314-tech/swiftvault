import assert from "node:assert/strict";
import axios from "axios";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import test from "node:test";
import AuthSession from "../models/AuthSession.js";
import SecurityAuditEvent from "../models/SecurityAuditEvent.js";
import Notification from "../models/Notification.js";
import Settings from "../models/Settings.js";
import User from "../models/User.js";
import { logout, verifyPhoneOTP } from "../controllers/authController.js";
import { requestReset, resetPassword } from "../controllers/resetController.js";
import { protect } from "../middleware/authMiddleware.js";
import { createAuthToken } from "../services/authSessionService.js";
import { hashOTP } from "../services/otpService.js";
import { invalidateSettingsCache } from "../services/settingsService.js";

const response = () => {
  let statusCode = 200;
  let body;
  return {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
};

test("auth sessions have unique token IDs and expire through a TTL index", () => {
  const indexes = AuthSession.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.tokenId === 1 && options.unique));
  assert.ok(indexes.some(([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0));
});

test("issued JWTs are linked to a persisted revocable session", async (context) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-session-secret";
  context.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  let storedSession;
  context.mock.method(AuthSession, "create", async (value) => { storedSession = value; });

  const token = await createAuthToken({ _id: "test-user", authTokenVersion: 3 });
  const claims = jwt.verify(token, process.env.JWT_SECRET);

  assert.equal(claims.id, "test-user");
  assert.equal(claims.authTokenVersion, 3);
  assert.equal(storedSession.userId, "test-user");
  assert.equal(storedSession.tokenId, claims.sessionId);
  assert.ok(storedSession.expiresAt > new Date());
});

test("authentication rejects legacy tokens and revoked sessions", async (context) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-session-secret";
  context.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  context.mock.method(User, "findById", () => ({
    select: async () => ({ _id: "test-user", authTokenVersion: 0, isSuspended: false }),
  }));
  let activeSession = false;
  context.mock.method(AuthSession, "findOne", async () =>
    activeSession ? { tokenId: "test-session" } : null
  );
  const res = response();
  let nextCalls = 0;
  const next = () => { nextCalls += 1; };

  const legacyToken = jwt.sign({ id: "test-user" }, process.env.JWT_SECRET);
  await protect({ headers: { authorization: `Bearer ${legacyToken}` } }, res, next);
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalls, 0);

  activeSession = true;
  const token = jwt.sign({
    id: "test-user",
    sessionId: "test-session",
    authTokenVersion: 0,
  }, process.env.JWT_SECRET);
  await protect({ headers: { authorization: `Bearer ${token}` } }, res, next);
  assert.equal(nextCalls, 1);
});

test("logout revokes only the authenticated server-side session", async (context) => {
  let revokedFilter;
  let revokedUpdate;
  context.mock.method(AuthSession, "updateOne", async (filter, update) => {
    revokedFilter = filter;
    revokedUpdate = update;
    return { modifiedCount: 1 };
  });

  const res = response();
  await logout({
    authSession: { _id: "session-id" },
    user: { _id: "user-id" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(revokedFilter._id, "session-id");
  assert.equal(revokedFilter.userId, "user-id");
  assert.equal(revokedUpdate.$set.revokeReason, "logout");
  assert.ok(revokedUpdate.$set.revokedAt instanceof Date);
});

test("password recovery issues a Termii OTP that expires after ten minutes", async (context) => {
  const previousApiKey = process.env.TERMII_API_KEY;
  process.env.TERMII_API_KEY = "test-termii-key";
  context.after(() => {
    if (previousApiKey === undefined) delete process.env.TERMII_API_KEY;
    else process.env.TERMII_API_KEY = previousApiKey;
    invalidateSettingsCache();
  });
  invalidateSettingsCache();

  const user = {
    phone: "2348000000000",
    phoneVerified: true,
    async save() {},
  };
  let smsMessage;
  context.mock.method(User, "findOne", async () => user);
  context.mock.method(Settings, "findOne", async () => ({ apiCredentials: {} }));
  context.mock.method(axios, "post", async (_url, payload) => {
    smsMessage = payload.sms;
    return { data: { message_id: "test-message" } };
  });

  const startedAt = Date.now();
  const res = response();
  await requestReset({ body: { phone: user.phone } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(user.phoneOTPPurpose, "password_reset");
  assert.ok(user.phoneOTPExpires instanceof Date);
  assert.ok(user.phoneOTPExpires.getTime() >= startedAt + 10 * 60 * 1000 - 100);
  assert.ok(user.phoneOTPExpires.getTime() <= Date.now() + 10 * 60 * 1000);
  assert.match(smsMessage, /expires in 10 minutes/);
});

test("password recovery consumes an OTP once and revokes sessions despite concurrent retries", async (context) => {
  const user = {
    _id: "user-id",
    phoneOTP: await hashOTP("123456"),
    phoneOTPExpires: new Date(Date.now() + 60_000),
    phoneOTPPurpose: "password_reset",
    password: "old-hash",
    authTokenVersion: 0,
  };
  context.mock.method(User, "findOne", async () => ({ ...user }));
  let revokeReason;
  context.mock.method(AuthSession, "updateMany", async (filter, update) => {
    revokeReason = update.$set.revokeReason;
    return { modifiedCount: 1 };
  });
  context.mock.method(SecurityAuditEvent, "create", async () => ({}));
  context.mock.method(Notification, "create", async () => ({}));
  context.mock.method(User, "findOneAndUpdate", async (filter, update) => {
    if (user.phoneOTP !== filter.phoneOTP || user.phoneOTPExpires <= filter.phoneOTPExpires.$gt) return null;
    Object.assign(user, update.$set);
    user.authTokenVersion += update.$inc.authTokenVersion;
    return user;
  });

  const makeRequest = () => ({
    body: { phone: "08000000000", otp: "123456", newPassword: "new-password" },
  });
  const firstResponse = response();
  const secondResponse = response();

  await Promise.all([
    resetPassword(makeRequest(), firstResponse),
    resetPassword(makeRequest(), secondResponse),
  ]);

  assert.deepEqual(
    [firstResponse.statusCode, secondResponse.statusCode].sort(),
    [200, 400]
  );
  assert.equal(user.authTokenVersion, 1);
  assert.equal(user.phoneOTP, null);
  assert.equal(revokeReason, "password_reset");
  assert.equal(await bcrypt.compare("new-password", user.password), true);
});

test("expired recovery OTP is rejected without changing credentials or revoking sessions", async (context) => {
  const user = {
    _id: "user-id",
    phoneOTP: await hashOTP("123456"),
    phoneOTPExpires: new Date(Date.now() - 1_000),
    phoneOTPPurpose: "password_reset",
    password: "unchanged",
    authTokenVersion: 0,
  };
  context.mock.method(User, "findOne", async () => user);
  let revokeCalls = 0;
  context.mock.method(AuthSession, "updateMany", async () => { revokeCalls += 1; });

  const res = response();
  await resetPassword({
    body: { phone: "08000000000", otp: "123456", newPassword: "new-password" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(user.password, "unchanged");
  assert.equal(user.authTokenVersion, 0);
  assert.equal(revokeCalls, 0);
});

test("phone verification atomically consumes a valid OTP before creating a session", async (context) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-session-secret";
  context.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const user = {
    _id: "user-id",
    fullName: "Test User",
    username: "test-user",
    phone: "2348000000000",
    phoneVerified: false,
    phoneOTP: await hashOTP("123456"),
    phoneOTPExpires: new Date(Date.now() + 60_000),
    phoneOTPPurpose: "phone_verification",
    authTokenVersion: 0,
  };
  context.mock.method(User, "findOne", async () => ({ ...user }));
  context.mock.method(User, "findOneAndUpdate", async (filter) => {
    if (user.phoneVerified || filter.phoneOTP !== user.phoneOTP) return null;
    user.phoneVerified = true;
    user.phoneOTP = null;
    user.phoneOTPExpires = null;
    return { ...user };
  });
  context.mock.method(AuthSession, "create", async () => ({ _id: "session-id" }));
  context.mock.method(AuthSession, "exists", async () => true);

  const res = response();
  await verifyPhoneOTP({ body: { phone: user.phone, otp: "123456" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(user.phoneVerified, true);
  assert.equal(user.phoneOTP, null);
  assert.ok(jwt.decode(res.body.token).sessionId);
});

test("expired phone-verification OTP is rejected", async (context) => {
  const user = {
    _id: "user-id",
    phoneVerified: false,
    phoneOTP: await hashOTP("123456"),
    phoneOTPExpires: new Date(Date.now() - 1_000),
    phoneOTPPurpose: "phone_verification",
  };
  context.mock.method(User, "findOne", async () => user);
  let updateCalls = 0;
  context.mock.method(User, "findOneAndUpdate", async () => { updateCalls += 1; });

  const res = response();
  await verifyPhoneOTP({ body: { phone: "2348000000000", otp: "123456" } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(updateCalls, 0);
});

test("phone-verification OTP cannot be reused as a password-reset code", async (context) => {
  const user = {
    _id: "user-id",
    phoneVerified: false,
    phoneOTP: await hashOTP("123456"),
    phoneOTPExpires: new Date(Date.now() + 60_000),
    phoneOTPPurpose: "password_reset",
  };
  context.mock.method(User, "findOne", async () => user);
  let updateCalls = 0;
  context.mock.method(User, "findOneAndUpdate", async () => { updateCalls += 1; });

  const res = response();
  await verifyPhoneOTP({ body: { phone: "2348000000000", otp: "123456" } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(updateCalls, 0);
});

test("password recovery does not replace an unverified phone-verification OTP", async (context) => {
  const user = {
    phoneVerified: false,
    phoneOTP: "existing-verification-code-hash",
    phoneOTPPurpose: "phone_verification",
  };
  context.mock.method(User, "findOne", async () => user);

  const res = response();
  await requestReset({ body: { phone: "08000000000" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(user.phoneOTP, "existing-verification-code-hash");
  assert.equal(user.phoneOTPPurpose, "phone_verification");
});
