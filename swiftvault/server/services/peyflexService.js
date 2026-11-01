import axios from "axios";
import { getCredential } from "./settingsService.js";

export const PEYFLEX_BASE_URL = "https://client.peyflex.com.ng";

const VERIFIED_ENDPOINTS = new Set([
  "cable.providers",
  "cable.verify",
  "cable.subscribe.request",
  "electricity.verify",
]);

export const assertPeyflexEndpointAvailable = (endpoint) => {
  if (!VERIFIED_ENDPOINTS.has(endpoint)) {
    throw Object.assign(new Error(`Peyflex ${endpoint} is unavailable until its API contract is verified.`), {
      code: "PEYFLEX_CONTRACT_UNVERIFIED",
    });
  }
};

// Resolves base URL and auth headers per-call, checking admin-configured Settings
// first and falling back to .env - so this works immediately for existing setups
// and becomes admin-editable once someone sets it in the Business Control Center.
const getConfig = async ({ requireToken = true } = {}) => {
  const configuredBaseUrl = ((await getCredential("peyflexBaseUrl")) || "").replace(/\/+$/, "");
  const baseUrl = configuredBaseUrl || PEYFLEX_BASE_URL;
  if (baseUrl !== PEYFLEX_BASE_URL) {
    throw Object.assign(new Error("Configured Peyflex base URL does not match the documented endpoint."), {
      code: "PEYFLEX_INVALID_BASE_URL",
    });
  }
  const apiToken = requireToken ? await getCredential("peyflexApiToken") : "";

  if (requireToken && !apiToken) {
    throw Object.assign(new Error("Peyflex is not configured."), { code: "PEYFLEX_NOT_CONFIGURED" });
  }

  return {
    baseUrl,
    headers: {
      headers: {
        ...(requireToken ? { Authorization: `Token ${apiToken}` } : {}),
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  };
};

export const getDataNetworks = async () => {
  assertPeyflexEndpointAvailable("data.networks");
};

export const getDataPlans = async (network) => {
  assertPeyflexEndpointAvailable("data.plans");
};

export const buyData = async (payload) => {
  assertPeyflexEndpointAvailable("data.purchase");
};

export const getAirtimeNetworks = async () => {
  assertPeyflexEndpointAvailable("airtime.networks");
};

export const buyAirtime = async (payload) => {
  assertPeyflexEndpointAvailable("airtime.purchase");
};

export const getCableProviders = async () => {
  assertPeyflexEndpointAvailable("cable.providers");
  const { baseUrl, headers } = await getConfig();
  const response = await axios.get(`${baseUrl}/api/cable/providers/`, headers);
  return response.data;
};

export const getCablePlans = async (provider) => {
  assertPeyflexEndpointAvailable("cable.plans");
};

export const verifyCable = async ({ identifier, iuc }) => {
  assertPeyflexEndpointAvailable("cable.verify");
  const { baseUrl, headers } = await getConfig();
  const response = await axios.post(`${baseUrl}/api/cable/verify/`, { identifier, iuc }, headers);
  return response.data;
};

export const rechargeCable = async ({ identifier, plan, iuc, phone, amount }) => {
  assertPeyflexEndpointAvailable("cable.subscribe.request");
  const { baseUrl, headers } = await getConfig();
  const payload = {
    identifier,
    plan,
    iuc,
    ...(phone ? { phone } : {}),
    ...(amount === undefined ? {} : { amount }),
  };
  const response = await axios.post(`${baseUrl}/api/cable/subscribe/`, payload, headers);
  return response.data;
};

// ELECTRICITY
export const getElectricityPlans = async () => {
  assertPeyflexEndpointAvailable("electricity.plans");
};

export const verifyMeter = async ({ meter, plan, type }) => {
  assertPeyflexEndpointAvailable("electricity.verify");
  const { baseUrl, headers } = await getConfig({ requireToken: false });
  const response = await axios.get(`${baseUrl}/api/electricity/verify/`, {
    ...headers,
    params: { identifier: "electricity", meter, plan, type },
  });
  return response.data;
};

export const rechargeElectricity = async ({ plan, meter, type, amount, phone }) => {
  assertPeyflexEndpointAvailable("electricity.purchase");
};

// --- RECHARGE CARD PRINTING (ePIN) FUNCTIONS ---
export const fetchEpinOptions = async () => {
  assertPeyflexEndpointAvailable("epin.options");
};

export const purchaseEpin = async ({ network, amount, quantity }) => {
  assertPeyflexEndpointAvailable("epin.purchase");
};

// --- EDUCATION / EXAM PIN FUNCTIONS ---
export const fetchEducationProviders = async () => {
  assertPeyflexEndpointAvailable("education.providers");
};

export const purchaseExamPin = async ({ provider, quantity }) => {
  assertPeyflexEndpointAvailable("education.purchase");
};
