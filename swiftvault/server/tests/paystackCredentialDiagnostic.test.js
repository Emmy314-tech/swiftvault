import assert from "node:assert/strict";
import test from "node:test";
import Settings from "../models/Settings.js";
import { getCredential, invalidateSettingsCache } from "../services/settingsService.js";
import { runPaystackCredentialDiagnostic } from "../services/paystackCredentialDiagnostic.js";

const enabledEnv = {
  NODE_ENV: "development",
  PAYSTACK_LIVE_PAYMENTS_ENABLED: "false",
  PAYSTACK_CREDENTIAL_DIAGNOSTIC_ENABLED: "true",
};

test("diagnostic calls only the fixed balance endpoint with a test key and returns no account data", async () => {
  let requestUrl;
  let requestConfig;
  const result = await runPaystackCredentialDiagnostic({
    env: enabledEnv,
    getSecretKey: async () => "sk_test_unit_placeholder",
    http: {
      get: async (url, config) => {
        requestUrl = url;
        requestConfig = config;
        return { status: 200, data: { status: true, data: [{ balance: 12345 }] } };
      },
    },
  });

  assert.equal(requestUrl, "https://api.paystack.co/balance");
  assert.equal(requestConfig.headers.Authorization, "Bearer sk_test_unit_placeholder");
  assert.equal(requestConfig.maxRedirects, 0);
  assert.deepEqual(result, { authenticated: true, httpStatus: 200 });
});

test("diagnostic does not call provider when opt-in or development safety flags are absent", async () => {
  let calls = 0;
  for (const env of [
    { ...enabledEnv, PAYSTACK_CREDENTIAL_DIAGNOSTIC_ENABLED: "false" },
    { ...enabledEnv, NODE_ENV: "production" },
    { ...enabledEnv, PAYSTACK_LIVE_PAYMENTS_ENABLED: "true" },
  ]) {
    const result = await runPaystackCredentialDiagnostic({
      env,
      getSecretKey: async () => "sk_test_unit_placeholder",
      http: { get: async () => { calls += 1; } },
    });
    assert.deepEqual(result, { authenticated: false, httpStatus: null });
  }
  assert.equal(calls, 0);
});

test("diagnostic rejects live, restricted, and unknown key formats without provider calls", async () => {
  let calls = 0;
  for (const key of ["sk_live_unit_placeholder", "rk_test_unit_placeholder", "unexpected_format"]) {
    const result = await runPaystackCredentialDiagnostic({
      env: enabledEnv,
      getSecretKey: async () => key,
      http: { get: async () => { calls += 1; } },
    });
    assert.deepEqual(result, { authenticated: false, httpStatus: null });
  }
  assert.equal(calls, 0);
});

test("diagnostic reports authentication status only and hides HTTP response data", async () => {
  const result = await runPaystackCredentialDiagnostic({
    env: enabledEnv,
    getSecretKey: async () => "sk_test_unit_placeholder",
    http: { get: async () => ({ status: 401, data: { message: "Invalid key", account: "must-not-leak" } }) },
  });

  assert.deepEqual(result, { authenticated: false, httpStatus: 401 });
});

test("diagnostic converts network failures to status-only failure without throwing", async () => {
  const result = await runPaystackCredentialDiagnostic({
    env: enabledEnv,
    getSecretKey: async () => "sk_test_unit_placeholder",
    http: { get: async () => { throw { response: { status: 503, data: { account: "must-not-leak" } } }; } },
  });

  assert.deepEqual(result, { authenticated: false, httpStatus: 503 });
});

test("Paystack credentials resolve from environment without creating Settings", async (context) => {
  const previousKey = process.env.PAYSTACK_SECRET_KEY;
  const previousPublicKey = process.env.PAYSTACK_PUBLIC_KEY;
  process.env.PAYSTACK_SECRET_KEY = "sk_test_unit_placeholder";
  process.env.PAYSTACK_PUBLIC_KEY = "pk_test_unit_placeholder";
  invalidateSettingsCache();
  context.mock.method(Settings, "findOne", async () => null);
  context.mock.method(Settings, "create", async () => assert.fail("diagnostic credential lookup must not write Settings"));

  try {
    const key = await getCredential("paystackSecretKey", { createSettingsIfMissing: false });
    assert.equal(key.startsWith("sk_test_"), true);
    const publicKey = await getCredential("paystackPublicKey", { createSettingsIfMissing: false });
    assert.equal(publicKey.startsWith("pk_test_"), true);
  } finally {
    if (previousKey === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = previousKey;
    if (previousPublicKey === undefined) delete process.env.PAYSTACK_PUBLIC_KEY;
    else process.env.PAYSTACK_PUBLIC_KEY = previousPublicKey;
    invalidateSettingsCache();
  }
});