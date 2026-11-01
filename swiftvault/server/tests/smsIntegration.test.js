import assert from "node:assert/strict";
import axios from "axios";
import test from "node:test";
import Settings from "../models/Settings.js";
import { sendSMS } from "../services/smsService.js";
import { invalidateSettingsCache } from "../services/settingsService.js";

test("Termii dispatch accepts only a provider-confirmed response and never calls live HTTP in the test", async (context) => {
  const previousKey = process.env.TERMII_API_KEY;
  const previousSender = process.env.TERMII_SENDER_ID;
  process.env.TERMII_API_KEY = "test-termii-key";
  process.env.TERMII_SENDER_ID = "SwiftVaultTest";
  invalidateSettingsCache();
  context.after(() => {
    if (previousKey === undefined) delete process.env.TERMII_API_KEY;
    else process.env.TERMII_API_KEY = previousKey;
    if (previousSender === undefined) delete process.env.TERMII_SENDER_ID;
    else process.env.TERMII_SENDER_ID = previousSender;
    invalidateSettingsCache();
  });

  context.mock.method(Settings, "findOne", async () => null);
  context.mock.method(Settings, "create", async () => new Settings());
  context.mock.method(console, "error", () => {});

  let providerResult = { data: { code: "ok", message_id: "test-message-id" } };
  let request;
  context.mock.method(axios, "post", async (...args) => {
    request = args;
    if (providerResult instanceof Error) throw providerResult;
    return providerResult;
  });

  assert.equal(await sendSMS("08012345678", "Test OTP 123456"), true);
  assert.equal(request[0], "https://api.ng.termii.com/api/sms/number/send");
  assert.equal(request[1].api_key, "test-termii-key");
  assert.equal(request[1].to, "2348012345678");
  assert.equal(request[1].from, "SwiftVaultTest");
  assert.equal(request[1].sms, "Test OTP 123456");

  providerResult = { data: { code: "error", message_id: "" } };
  assert.equal(await sendSMS("08012345678", "Test OTP 123456"), false);
  providerResult = new Error("offline");
  assert.equal(await sendSMS("08012345678", "Test OTP 123456"), false);

  process.env.TERMII_API_KEY = "";
  invalidateSettingsCache();
  assert.equal(await sendSMS("08012345678", "Test OTP 123456"), false);
});
