import crypto from "node:crypto";
import axios from "axios";

const PAYSTACK_API_URL = "https://api.paystack.co";
const CHECKOUT_HOST = "checkout.paystack.com";

export const isPaystackLivePaymentsEnabled = (env = process.env) =>
  env.NODE_ENV === "production" && env.PAYSTACK_LIVE_PAYMENTS_ENABLED === "true";

export const nairaToKobo = (value) => {
  const amount = typeof value === "number" ? String(value) : String(value ?? "").trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) throw new Error("Enter a valid amount with no more than two decimal places.");

  const major = BigInt(match[1]);
  const minor = BigInt((match[2] || "").padEnd(2, "0") || "0");
  const kobo = major * 100n + minor;
  if (kobo <= 0n || kobo > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount is outside the supported range.");
  }
  return Number(kobo);
};

export const verifyPaystackSignature = (rawBody, signature, secretKey) => {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== "string" || !secretKey || !/^[a-f\d]{128}$/i.test(signature)) {
    return false;
  }
  const expected = crypto.createHmac("sha512", secretKey).update(rawBody).digest();
  const provided = Buffer.from(signature, "hex");
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
};

export const matchPaystackPayment = (payment, funding) => {
  if (!payment || typeof payment !== "object") return { outcome: "invalid", reason: "missing_payment" };
  if (payment.reference !== funding.reference) return { outcome: "invalid", reason: "reference_mismatch" };
  if (!Number.isSafeInteger(payment.amount) || payment.amount !== funding.expectedAmountKobo) {
    return { outcome: "invalid", reason: "amount_mismatch" };
  }
  if (String(payment.currency || "").toUpperCase() !== "NGN" || funding.currency !== "NGN") {
    return { outcome: "invalid", reason: "currency_mismatch" };
  }
  const expectedEmail = String(funding.customerEmail || "").trim().toLowerCase();
  const paidEmail = String(payment.customer?.email || "").trim().toLowerCase();
  if (!expectedEmail || !paidEmail || expectedEmail !== paidEmail) {
    return { outcome: "invalid", reason: "customer_mismatch" };
  }
  if (funding.providerCustomerCode) {
    const customerCode = payment.customer?.customer_code || payment.customer?.code;
    if (customerCode !== funding.providerCustomerCode) {
      return { outcome: "invalid", reason: "customer_mismatch" };
    }
  } else if (String(payment.metadata?.fundingId || "") !== String(funding._id || "") ||
    String(payment.metadata?.customerId || "") !== String(funding.userId || "")) {
    return { outcome: "invalid", reason: "funding_record_mismatch" };
  }
  if (payment.status !== "success") {
    return { outcome: ["pending", "processing", "ongoing"].includes(String(payment.status || "").toLowerCase())
      ? "pending"
      : "failed", reason: "payment_not_successful" };
  }
  return { outcome: "success", reason: null };
};

const assertProviderCallAllowed = ({ env, secretKey, mockedTransport }) => {
  const enabled = env.PAYSTACK_LIVE_PAYMENTS_ENABLED === "true";
  const testMockAllowed = env.NODE_ENV === "test" && mockedTransport;
  if (!enabled || (env.NODE_ENV !== "production" && !testMockAllowed)) {
    const error = new Error("Paystack payments are disabled by server configuration.");
    error.code = "PAYSTACK_DISABLED";
    throw error;
  }
  if (!secretKey) {
    const error = new Error("Paystack server credentials are not configured.");
    error.code = "PAYSTACK_NOT_CONFIGURED";
    throw error;
  }
  if (env.NODE_ENV !== "production" && secretKey.startsWith("sk_live_")) {
    const error = new Error("Live Paystack credentials are blocked outside production.");
    error.code = "PAYSTACK_LIVE_KEY_BLOCKED";
    throw error;
  }
};

export const createPaystackGateway = ({
  getSecretKey,
  env = process.env,
  http = axios,
  allowTestTransport = false,
} = {}) => {
  const authorize = async () => {
    const secretKey = await getSecretKey?.();
    assertProviderCallAllowed({ env, secretKey, mockedTransport: allowTestTransport });
    return secretKey;
  };

  return {
    async createCustomer({ email, firstName, lastName, phone }) {
      const secretKey = await authorize();
      const response = await http.post(`${PAYSTACK_API_URL}/customer`, {
        email,
        first_name: firstName,
        last_name: lastName,
        phone,
      }, {
        headers: { Authorization: `Bearer ${secretKey}` },
        timeout: 15000,
      });
      const customerCode = response.data?.data?.customer_code;
      if (response.data?.status !== true || typeof customerCode !== "string" || !customerCode) {
        throw new Error("Paystack did not return a valid customer record.");
      }
      return { customerCode };
    },

    async fetchCustomer(emailOrCode) {
      const secretKey = await authorize();
      const response = await http.get(`${PAYSTACK_API_URL}/customer/${encodeURIComponent(emailOrCode)}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
        timeout: 15000,
        validateStatus: () => true,
      });
      if (response.status === 404) return null;
      const customer = response.data?.data;
      const customerCode = customer?.customer_code;
      if (response.status < 200 || response.status >= 300 || response.data?.status !== true ||
        typeof customerCode !== "string" || !customerCode) {
        throw new Error("Paystack customer lookup did not return a valid customer record.");
      }
      const account = customer.dedicated_account;
      const dedicatedAccount = account?.assigned === true && account.active === true &&
        typeof account.account_number === "string" && account.account_number &&
        typeof account.account_name === "string" && account.account_name &&
        typeof account.bank?.name === "string" && account.bank.name
        ? {
          id: account.id,
          accountNumber: account.account_number,
          accountName: account.account_name,
          bankName: account.bank.name,
          bankSlug: account.bank.slug || null,
          currency: account.currency || null,
        }
        : null;
      return { customerCode, dedicatedAccount };
    },

    async identifyCustomer({ customerCode, accountNumber, bvn, bankCode, firstName, lastName }) {
      const secretKey = await authorize();
      const response = await http.post(`${PAYSTACK_API_URL}/customer/${encodeURIComponent(customerCode)}/identification`, {
        country: "NG",
        type: "bank_account",
        account_number: accountNumber,
        bvn,
        bank_code: bankCode,
        first_name: firstName,
        last_name: lastName,
      }, {
        headers: { Authorization: `Bearer ${secretKey}` },
        timeout: 15000,
      });
      if (response.status !== 202 || response.data?.status !== true) {
        throw new Error("Paystack customer identification was not accepted for processing.");
      }
      return { status: "pending" };
    },

    async assignDedicatedAccount({ customerCode, preferredBank }) {
      const secretKey = await authorize();
      const response = await http.post(`${PAYSTACK_API_URL}/dedicated_account`, {
        customer: customerCode,
        preferred_bank: preferredBank,
      }, {
        headers: { Authorization: `Bearer ${secretKey}` },
        timeout: 15000,
      });
      if (response.status === 202 && response.data?.status === true) {
        return { status: "pending" };
      }
      const account = response.data?.data;
      if (response.data?.status !== true || account?.assigned !== true || account.active !== true ||
        typeof account.account_number !== "string" || !account.account_number ||
        typeof account.account_name !== "string" || !account.account_name ||
        typeof account.bank?.name !== "string" || !account.bank.name) {
        throw new Error("Paystack did not return an assigned dedicated account.");
      }
      return {
        status: "active",
        id: account.id,
        accountNumber: account.account_number,
        accountName: account.account_name,
        bankName: account.bank.name,
        bankSlug: account.bank.slug || null,
        currency: account.currency || null,
      };
    },

    async initialize({ email, amountKobo, reference, callbackUrl, metadata }) {
      const secretKey = await authorize();
      const response = await http.post(`${PAYSTACK_API_URL}/transaction/initialize`, {
        email,
        amount: amountKobo,
        currency: "NGN",
        reference,
        callback_url: callbackUrl,
        metadata,
      }, {
        headers: { Authorization: `Bearer ${secretKey}` },
        timeout: 15000,
      });
      const authorizationUrl = response.data?.data?.authorization_url;
      let checkoutUrl;
      try {
        checkoutUrl = new URL(authorizationUrl);
      } catch {
        throw new Error("Paystack did not return a valid checkout URL.");
      }
      if (response.data?.status !== true || checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== CHECKOUT_HOST) {
        throw new Error("Paystack did not return an approved checkout URL.");
      }
      return { authorizationUrl: checkoutUrl.toString() };
    },

    async verify(reference) {
      const secretKey = await authorize();
      const response = await http.get(
        `${PAYSTACK_API_URL}/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${secretKey}` }, timeout: 15000 }
      );
      if (response.data?.status !== true || !response.data?.data) {
        throw new Error("Paystack did not return an authoritative verification result.");
      }
      return response.data.data;
    },
  };
};