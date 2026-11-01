import Settings from "../models/Settings.js";
import { encrypt, decrypt } from "../utils/encryption.js";

// In-memory cache so we don't hit the DB on every single purchase/transfer.
// Invalidated any time settings are updated via updateSettings() below.
let cachedSettings = null;

export const getSettings = async ({ createIfMissing = true } = {}) => {
  if (cachedSettings) return cachedSettings;

  let settings = await Settings.findOne();
  if (!settings && createIfMissing) {
    settings = await Settings.create({});
  }

  if (settings) cachedSettings = settings;
  return settings;
};

export const invalidateSettingsCache = () => {
  cachedSettings = null;
};

// Deep-merges a partial update into the singleton Settings document and saves it.
// Example: updateSettings({ pricing: { data: { normal: 50 } } })
export const updateSettings = async (partialUpdate) => {
  const settings = await getSettings();

  const deepMerge = (target, source) => {
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key]) &&
        !(source[key] instanceof Date) &&
        target[key] &&
        typeof target[key].toObject === "function"
      ) {
        deepMerge(target[key], source[key]);
      } else if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key]) &&
        !(source[key] instanceof Date)
      ) {
        target[key] = target[key] || {};
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  };

  deepMerge(settings, partialUpdate);
  await settings.save();
  invalidateSettingsCache();
  return getSettings();
};

// --- Company bank accounts ---
export const addCompanyBankAccount = async (account) => {
  const settings = await getSettings();
  settings.companyBankAccounts.push(account);
  await settings.save();
  invalidateSettingsCache();
  return getSettings();
};

export const updateCompanyBankAccount = async (accountId, updates) => {
  const settings = await getSettings();
  const account = settings.companyBankAccounts.id(accountId);
  if (!account) throw new Error("Bank account not found");
  Object.assign(account, updates);
  await settings.save();
  invalidateSettingsCache();
  return getSettings();
};

export const removeCompanyBankAccount = async (accountId) => {
  const settings = await getSettings();
  settings.companyBankAccounts.pull(accountId);
  await settings.save();
  invalidateSettingsCache();
  return getSettings();
};

export const getActiveCompanyBankAccounts = async () => {
  const settings = await getSettings();
  return settings.companyBankAccounts.filter((acc) => acc.status === "active");
};

// --- Service enable/disable ---
export const isServiceEnabled = async (serviceName) => {
  const settings = await getSettings();
  return settings.services?.[serviceName] !== false; // defaults to enabled if unset
};

// --- API credentials: DB value (decrypted) takes priority, falls back to .env ---
const CREDENTIAL_ENV_MAP = {
  termiiApiKey: "TERMII_API_KEY",
  paystackSecretKey: "PAYSTACK_SECRET_KEY",
  paystackPublicKey: "PAYSTACK_PUBLIC_KEY",
  peyflexApiToken: "PEYFLEX_API_TOKEN",
  peyflexBaseUrl: "PEYFLEX_BASE_URL",
};
const CREDENTIAL_DEFAULT_MAP = {
  peyflexBaseUrl: "https://client.peyflex.com.ng",
};

export const getCredential = async (credentialKey, { createSettingsIfMissing = true } = {}) => {
  const settings = await getSettings({ createIfMissing: createSettingsIfMissing });
  const stored = settings?.apiCredentials?.[credentialKey];

  if (stored) {
    try {
      const decrypted = decrypt(stored);
      if (decrypted) return decrypted;
    } catch (err) {
      console.error(`Failed to decrypt ${credentialKey}; falling back to .env. Error type: ${err.name || "Error"}`);
    }
  }

  return process.env[CREDENTIAL_ENV_MAP[credentialKey]] || CREDENTIAL_DEFAULT_MAP[credentialKey] || "";
};

export const setCredential = async (credentialKey, plainValue) => {
  const settings = await getSettings();
  settings.apiCredentials[credentialKey] = plainValue ? encrypt(plainValue) : "";
  await settings.save();
  invalidateSettingsCache();
  return getSettings();
};

// Returns which credentials are set (from DB or .env) without exposing raw values -
// used by the admin panel to show status without leaking secrets.
export const getCredentialStatus = async () => {
  const status = {};
  for (const key of Object.keys(CREDENTIAL_ENV_MAP)) {
    const value = await getCredential(key);
    const credentialStatus = {
      configured: Boolean(value),
      source: (await getSettings()).apiCredentials?.[key]
        ? "database"
        : process.env[CREDENTIAL_ENV_MAP[key]]
          ? "env"
          : CREDENTIAL_DEFAULT_MAP[key]
            ? "default"
            : "none",
    };
    if (key === "paystackSecretKey") {
      credentialStatus.mode = value.startsWith("sk_test_")
        ? "test"
        : value.startsWith("sk_live_")
            ? "live"
            : value
              ? "unknown"
              : "missing";
    }
    status[key] = credentialStatus;
  }
  return status;
};

// --- Legacy compatibility helper (unused by any current route, kept in case a future upgrade flow needs it) ---
export const handleReferralUpgradeReward = async (referrerId) => {
  if (!referrerId) return;
  const settings = await getSettings();
  const User = (await import("../models/User.js")).default;
  const sponsor = await User.findById(referrerId);
  if (!sponsor) return;
  sponsor.walletBalance += settings.referralUpgradeReward;
  await sponsor.save();
};
