import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  createPaystackGateway,
  matchPaystackPayment,
  nairaToKobo,
  verifyPaystackSignature,
} from "../services/paystackGateway.js";

test("disabled Paystack mode blocks initialization and verification before provider calls", async () => {
  let calls = 0;
  const gateway = createPaystackGateway({
    getSecretKey: async () => "unit-test-key",
    env: { NODE_ENV: "development", PAYSTACK_LIVE_PAYMENTS_ENABLED: "false" },
    http: {
      post: async () => { calls += 1; },
      get: async () => { calls += 1; },
    },
  });

  await assert.rejects(gateway.initialize({}), { code: "PAYSTACK_DISABLED" });
  await assert.rejects(gateway.verify("test-reference"), { code: "PAYSTACK_DISABLED" });
  await assert.rejects(gateway.createCustomer({}), { code: "PAYSTACK_DISABLED" });
  await assert.rejects(gateway.identifyCustomer({}), { code: "PAYSTACK_DISABLED" });
  await assert.rejects(gateway.assignDedicatedAccount({}), { code: "PAYSTACK_DISABLED" });
  assert.equal(calls, 0);
});

test("development mode blocks provider calls even when the flag and a live-shaped key are present", async () => {
  let calls = 0;
  const gateway = createPaystackGateway({
    getSecretKey: async () => "sk_live_unit_placeholder",
    env: { NODE_ENV: "development", PAYSTACK_LIVE_PAYMENTS_ENABLED: "true" },
    allowTestTransport: true,
    http: { post: async () => { calls += 1; }, get: async () => { calls += 1; } },
  });

  await assert.rejects(gateway.initialize({}), { code: "PAYSTACK_DISABLED" });
  assert.equal(calls, 0);
});

test("test-mode provider verification uses only an injected mocked transport", async () => {
  const payment = {
    reference: "SVP-test",
    amount: 12540,
    currency: "NGN",
    status: "success",
    customer: { email: "customer@example.test" },
    metadata: { fundingId: "funding-1", customerId: "user-1" },
  };
  const requestedUrls = [];
  const gateway = createPaystackGateway({
    getSecretKey: async () => "unit-test-secret",
    env: { NODE_ENV: "test", PAYSTACK_LIVE_PAYMENTS_ENABLED: "true" },
    allowTestTransport: true,
    http: {
      post: async (url, body) => {
        requestedUrls.push(url);
        assert.equal(body.amount, 12540);
        return { data: { status: true, data: { authorization_url: "https://checkout.paystack.com/test" } } };
      },
      get: async (url) => {
        requestedUrls.push(url);
        return { data: { status: true, data: payment } };
      },
    },
  });

  assert.equal((await gateway.initialize({ email: "customer@example.test", amountKobo: 12540, reference: "SVP-test" })).authorizationUrl,
    "https://checkout.paystack.com/test");
  assert.deepEqual(await gateway.verify("SVP-test"), payment);
  assert.equal(requestedUrls.length, 2);
  assert.ok(requestedUrls.every((url) => url.startsWith("https://api.paystack.co/")));
});

test("amount conversion uses safe integer kobo and rejects invalid precision", () => {
  assert.equal(nairaToKobo("125.40"), 12540);
  assert.equal(nairaToKobo(1), 100);
  assert.throws(() => nairaToKobo("0"), /outside the supported range/);
  assert.throws(() => nairaToKobo("1.001"), /two decimal places/);
  assert.throws(() => nairaToKobo("90071992547410"), /outside the supported range/);
});

test("Paystack HMAC verifies the exact raw body and rejects invalid signatures", () => {
  const rawBody = Buffer.from('{"event":"charge.success"}');
  const secret = "unit-test-secret";
  const signature = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");

  assert.equal(verifyPaystackSignature(rawBody, signature, secret), true);
  assert.equal(verifyPaystackSignature(Buffer.from(`${rawBody} `), signature, secret), false);
  assert.equal(verifyPaystackSignature(rawBody, "invalid", secret), false);
  assert.equal(verifyPaystackSignature(rawBody, signature, "wrong-secret"), false);
});

test("provider success must match reference, kobo amount, currency, and customer", () => {
  const funding = {
    reference: "SV-PAYSTACK-test",
    expectedAmountKobo: 12540,
    currency: "NGN",
    customerEmail: "customer@example.test",
  };
  const payment = {
    reference: funding.reference,
    amount: funding.expectedAmountKobo,
    currency: "NGN",
    status: "success",
    customer: { email: funding.customerEmail },
  };

  assert.equal(matchPaystackPayment(payment, funding).outcome, "success");
  assert.equal(matchPaystackPayment({ ...payment, reference: "other" }, funding).reason, "reference_mismatch");
  assert.equal(matchPaystackPayment({ ...payment, amount: 12541 }, funding).reason, "amount_mismatch");
  assert.equal(matchPaystackPayment({ ...payment, currency: "USD" }, funding).reason, "currency_mismatch");
  assert.equal(matchPaystackPayment({ ...payment, customer: { email: "other@example.test" } }, funding).reason, "customer_mismatch");
  assert.equal(matchPaystackPayment({ ...payment, metadata: { ...payment.metadata, fundingId: "another-funding" } }, funding).reason, "funding_record_mismatch");
  assert.equal(matchPaystackPayment({ ...payment, status: "pending" }, funding).outcome, "pending");
  assert.equal(matchPaystackPayment({ ...payment, status: "failed" }, funding).outcome, "failed");
});

test("Paystack customer identification remains pending until its asynchronous webhook", async () => {
  const requests = [];
  const gateway = createPaystackGateway({
    getSecretKey: async () => "unit-test-secret",
    env: { NODE_ENV: "test", PAYSTACK_LIVE_PAYMENTS_ENABLED: "true" },
    allowTestTransport: true,
    http: {
      post: async (url, body, config) => {
        requests.push({ url, body, authorization: config.headers.Authorization });
        if (url.endsWith("/customer")) {
          return { status: 200, data: { status: true, data: { customer_code: "CUS_test" } } };
        }
        if (url.endsWith("/identification")) {
          return { status: 202, data: { status: true, message: "Customer Identification in progress" } };
        }
        return {
          status: 200,
          data: {
            status: true,
            data: {
              id: 21,
              assigned: true,
              active: true,
              account_number: "0000000000",
              account_name: "Test Customer",
              bank: { name: "Test Bank", slug: "test-bank" },
              currency: "NGN",
            },
          },
        };
      },
    },
  });

  const customer = await gateway.createCustomer({
    email: "customer@example.test",
    firstName: "Test",
    lastName: "Customer",
    phone: "+2348000000000",
  });
  const identification = await gateway.identifyCustomer({
    customerCode: customer.customerCode,
    accountNumber: "0123456789",
    bvn: "20012345678",
    bankCode: "007",
    firstName: "Test",
    lastName: "Customer",
  });
  const account = await gateway.assignDedicatedAccount({
    customerCode: customer.customerCode,
    preferredBank: "test-bank",
  });

  assert.deepEqual(customer, { customerCode: "CUS_test" });
  assert.deepEqual(identification, { status: "pending" });
  assert.equal(requests[0].url, "https://api.paystack.co/customer");
  assert.equal(requests[0].body.first_name, "Test");
  assert.equal(requests[1].url, "https://api.paystack.co/customer/CUS_test/identification");
  assert.equal(requests[1].body.type, "bank_account");
  assert.equal(requests[1].body.bvn, "20012345678");
  assert.equal(requests[2].url, "https://api.paystack.co/dedicated_account");
  assert.deepEqual(account, {
    status: "active",
    id: 21,
    accountNumber: "0000000000",
    accountName: "Test Customer",
    bankName: "Test Bank",
    bankSlug: "test-bank",
    currency: "NGN",
  });
  assert.ok(requests.every(({ authorization }) => authorization === "Bearer unit-test-secret"));
});

test("Paystack DVA assignment 202 response remains pending without account details", async () => {
  const gateway = createPaystackGateway({
    getSecretKey: async () => "unit-test-secret",
    env: { NODE_ENV: "test", PAYSTACK_LIVE_PAYMENTS_ENABLED: "true" },
    allowTestTransport: true,
    http: { post: async () => ({ status: 202, data: { status: true, message: "Assignment in progress" } }) },
  });

  assert.deepEqual(await gateway.assignDedicatedAccount({ customerCode: "CUS_test", preferredBank: "test-bank" }), { status: "pending" });
});

test("Paystack customer lookup reuses an existing customer and assigned account", async () => {
  let requestUrl;
  const gateway = createPaystackGateway({
    getSecretKey: async () => "unit-test-secret",
    env: { NODE_ENV: "test", PAYSTACK_LIVE_PAYMENTS_ENABLED: "true" },
    allowTestTransport: true,
    http: {
      get: async (url) => {
        requestUrl = url;
        return {
          status: 200,
          data: {
            status: true,
            data: {
              customer_code: "CUS_existing",
              dedicated_account: {
                id: 21,
                assigned: true,
                active: true,
                account_number: "0000000000",
                account_name: "Test Customer",
                bank: { name: "Test Bank", slug: "test-bank" },
                currency: "NGN",
              },
            },
          },
        };
      },
    },
  });

  const customer = await gateway.fetchCustomer("customer@example.test");
  assert.equal(requestUrl, "https://api.paystack.co/customer/customer%40example.test");
  assert.equal(customer.customerCode, "CUS_existing");
  assert.equal(customer.dedicatedAccount.accountNumber, "0000000000");
});