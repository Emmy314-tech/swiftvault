import { authorizeSensitiveAction } from "../services/securityService.js";

const getStorageKey = async (fingerprint) => {
  const bytes = new TextEncoder().encode(fingerprint);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  return `swiftvault:idempotency:${hash}`;
};

export const postIdempotently = async (api, path, payload, excludedFields = [], action = null) => {
  const fingerprintPayload = { ...payload };
  excludedFields.forEach((field) => delete fingerprintPayload[field]);
  const fingerprint = `${path}:${JSON.stringify(fingerprintPayload)}`;
  const storageKey = await getStorageKey(fingerprint);
  const key = sessionStorage.getItem(storageKey) || globalThis.crypto.randomUUID();
  sessionStorage.setItem(storageKey, key);

  try {
    let stepUpToken = null;
    if (action) {
      stepUpToken = await authorizeSensitiveAction(action, payload);
    }
    const headers = { "Idempotency-Key": key };
    if (stepUpToken) headers["X-Step-Up-Token"] = stepUpToken;
    const response = await api.post(path, payload, { headers });
    if (response.status !== 202) sessionStorage.removeItem(storageKey);
    return response;
  } catch (error) {
    const status = error.response?.status;
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) sessionStorage.removeItem(storageKey);
    throw error;
  }
};