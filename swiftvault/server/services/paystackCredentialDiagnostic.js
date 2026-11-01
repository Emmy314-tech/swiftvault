import axios from "axios";

const PAYSTACK_BALANCE_URL = "https://api.paystack.co/balance";
const DISABLED_RESULT = Object.freeze({ authenticated: false, httpStatus: null });

export const runPaystackCredentialDiagnostic = async ({
  env = process.env,
  getSecretKey,
  http = axios,
} = {}) => {
  if (
    env.PAYSTACK_CREDENTIAL_DIAGNOSTIC_ENABLED !== "true" ||
    env.NODE_ENV !== "development" ||
    env.PAYSTACK_LIVE_PAYMENTS_ENABLED !== "false"
  ) return { ...DISABLED_RESULT };

  let secretKey;
  try {
    secretKey = await getSecretKey?.();
  } catch {
    return { ...DISABLED_RESULT };
  }
  if (typeof secretKey !== "string" || !secretKey.startsWith("sk_test_")) {
    return { ...DISABLED_RESULT };
  }

  try {
    const response = await http.get(PAYSTACK_BALANCE_URL, {
      headers: { Authorization: `Bearer ${secretKey}` },
      timeout: 10000,
      maxRedirects: 0,
      validateStatus: () => true,
    });
    return {
      authenticated: response.status === 200 && response.data?.status === true,
      httpStatus: Number.isInteger(response.status) ? response.status : null,
    };
  } catch (error) {
    return {
      authenticated: false,
      httpStatus: Number.isInteger(error?.response?.status) ? error.response.status : null,
    };
  }
};