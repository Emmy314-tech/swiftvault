import assert from "node:assert/strict";
import axios from "axios";
import test from "node:test";
import Settings from "../models/Settings.js";
import { invalidateSettingsCache } from "../services/settingsService.js";
import {
  PEYFLEX_BASE_URL,
  assertPeyflexEndpointAvailable,
  getDataPlans,
  getDataNetworks,
  buyData,
  getAirtimeNetworks,
  buyAirtime,
  getCableProviders,
  getCablePlans,
  rechargeCable,
  verifyCable,
  getElectricityPlans,
  verifyMeter,
  rechargeElectricity,
  fetchEpinOptions,
  purchaseEpin,
  fetchEducationProviders,
  purchaseExamPin,
} from "../services/peyflexService.js";
import { classifyPeyflexResponse, isDefinitivePeyflexFailure } from "../services/providerOutcome.js";
import { requirePeyflexEndpoint } from "../middleware/peyflexContract.js";

const withMockedConfiguration = (context) => {
  const previousBaseUrl = process.env.PEYFLEX_BASE_URL;
  const previousToken = process.env.PEYFLEX_API_TOKEN;
  process.env.PEYFLEX_BASE_URL = PEYFLEX_BASE_URL;
  process.env.PEYFLEX_API_TOKEN = "offline-test-token";
  context.mock.method(Settings, "findOne", async () => ({ apiCredentials: {} }));
  invalidateSettingsCache();
  context.after(() => {
    if (previousBaseUrl === undefined) delete process.env.PEYFLEX_BASE_URL;
    else process.env.PEYFLEX_BASE_URL = previousBaseUrl;
    if (previousToken === undefined) delete process.env.PEYFLEX_API_TOKEN;
    else process.env.PEYFLEX_API_TOKEN = previousToken;
    invalidateSettingsCache();
  });
};

test("Peyflex cable providers use the documented URL and Token header", async (context) => {
  withMockedConfiguration(context);
  let request;
  context.mock.method(axios, "get", async (url, config) => {
    request = { url, config };
    return { data: { status: "SUCCESS", providers: [{ identifier: "startimes", name: "Startimes" }] } };
  });

  const result = await getCableProviders();
  assert.equal(request.url, `${PEYFLEX_BASE_URL}/api/cable/providers/`);
  assert.equal(request.config.headers.Authorization, "Token offline-test-token");
  assert.equal(request.config.timeout, 15000);
  assert.equal(result.providers[0].identifier, "startimes");
});

test("Peyflex cable verification maps to documented iuc and identifier fields", async (context) => {
  withMockedConfiguration(context);
  let request;
  context.mock.method(axios, "post", async (url, body, config) => {
    request = { url, body, config };
    return { data: { status: "SUCCESS", customer_name: "Test Customer" } };
  });

  await verifyCable({ identifier: "startimes", iuc: "1234567890" });
  assert.equal(request.url, `${PEYFLEX_BASE_URL}/api/cable/verify/`);
  assert.deepEqual(request.body, { identifier: "startimes", iuc: "1234567890" });
  assert.equal(request.config.headers.Authorization, "Token offline-test-token");
});

test("Peyflex cable subscription uses the documented subscribe endpoint and shown fields", async (context) => {
  withMockedConfiguration(context);
  let request;
  context.mock.method(axios, "post", async (url, body) => {
    request = { url, body };
    return { data: { status: "SUCCESS", reference: "offline-reference" } };
  });

  await rechargeCable({
    identifier: "startimes",
    plan: "basic",
    iuc: "1234567890",
    phone: "08000000000",
    amount: 2500,
  });
  assert.equal(request.url, `${PEYFLEX_BASE_URL}/api/cable/subscribe/`);
  assert.deepEqual(request.body, {
    identifier: "startimes",
    plan: "basic",
    iuc: "1234567890",
    phone: "08000000000",
    amount: 2500,
  });
});

test("electricity meter verification is unauthenticated and uses encoded query parameters", async (context) => {
  withMockedConfiguration(context);
  let request;
  context.mock.method(axios, "get", async (url, config) => {
    request = { url, config };
    return { data: { status: "SUCCESS", customer_name: "Test Customer" } };
  });

  await verifyMeter({ meter: "123 456", plan: "ikedc", type: "prepaid" });
  assert.equal(request.url, `${PEYFLEX_BASE_URL}/api/electricity/verify/`);
  assert.deepEqual(request.config.params, {
    identifier: "electricity",
    meter: "123 456",
    plan: "ikedc",
    type: "prepaid",
  });
  assert.equal(request.config.headers.Authorization, undefined);
});

test("unverified API endpoints are blocked before any provider request", async (context) => {
  let requestCount = 0;
  context.mock.method(axios, "get", async () => {
    requestCount += 1;
    return { data: {} };
  });
  context.mock.method(axios, "post", async () => {
    requestCount += 1;
    return { data: {} };
  });

  const blockedCalls = [
    () => getDataNetworks(),
    () => getDataPlans("mtn"),
    () => buyData({}),
    () => getAirtimeNetworks(),
    () => buyAirtime({}),
    () => getCablePlans("startimes"),
    () => getElectricityPlans(),
    () => rechargeElectricity({}),
    () => fetchEpinOptions(),
    () => purchaseEpin({}),
    () => fetchEducationProviders(),
    () => purchaseExamPin({}),
  ];
  for (const call of blockedCalls) {
    await assert.rejects(call(), (error) => error.code === "PEYFLEX_CONTRACT_UNVERIFIED");
  }
  assert.equal(requestCount, 0);
  for (const endpoint of [
    "cable.providers",
    "cable.verify",
    "cable.subscribe.request",
    "electricity.verify",
  ]) {
    assert.doesNotThrow(() => assertPeyflexEndpointAvailable(endpoint));
  }
  for (const endpoint of [
    "airtime.networks",
    "airtime.purchase",
    "data.networks",
    "data.plans",
    "data.purchase",
    "cable.plans",
    "cable.purchase",
    "electricity.plans",
    "electricity.purchase",
    "epin.options",
    "epin.purchase",
    "education.providers",
    "education.purchase",
    "betting.purchase",
  ]) {
    assert.throws(
      () => assertPeyflexEndpointAvailable(endpoint),
      { code: "PEYFLEX_CONTRACT_UNVERIFIED" },
      endpoint,
    );
  }
});

test("unverified purchase routes return 503 before reaching purchase handlers", () => {
  let statusCode = null;
  let nextCalled = false;
  const middleware = requirePeyflexEndpoint("data.purchase");
  middleware(
    {},
    {
      status(code) { statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    },
    () => { nextCalled = true; }
  );

  assert.equal(statusCode, 503);
  assert.equal(nextCalled, false);
});

test("Peyflex HTTP errors do not prove definitive purchase failure", async (context) => {
  withMockedConfiguration(context);
  context.mock.method(axios, "post", async () => {
    const error = new Error("Request failed with status code 400");
    error.response = {
      status: 400,
      data: { status: "FAILED", message: "Insufficient wallet balance" },
    };
    throw error;
  });

  await assert.rejects(
    rechargeCable({ identifier: "startimes", plan: "basic", iuc: "1234567890" }),
    (error) => !isDefinitivePeyflexFailure(error)
  );
  assert.equal(isDefinitivePeyflexFailure({
    response: { status: 400, data: { message: "Insufficient wallet balance" } },
  }), false);
});

test("malformed provider JSON and request timeouts do not prove purchase success or failure", async (context) => {
  withMockedConfiguration(context);
  let calls = 0;
  context.mock.method(axios, "post", async () => {
    calls += 1;
    if (calls === 1) return { data: "not-json" };
    const error = new Error("timeout");
    error.code = "ECONNABORTED";
    throw error;
  });
  const malformed = await rechargeCable({
    identifier: "startimes",
    plan: "basic",
    iuc: "1234567890",
  });
  assert.equal(classifyPeyflexResponse(malformed), "pending");

  await assert.rejects(
    rechargeCable({ identifier: "startimes", plan: "basic", iuc: "1234567890" }),
    (error) => !isDefinitivePeyflexFailure(error)
  );
});
