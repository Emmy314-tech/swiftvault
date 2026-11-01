import {
  getSettings,
  updateSettings,
  addCompanyBankAccount,
  updateCompanyBankAccount,
  removeCompanyBankAccount,
  getActiveCompanyBankAccounts,
  setCredential,
  getCredentialStatus,
} from "../services/settingsService.js";
import { logAdminActivity } from "../services/adminActivityService.js";
import {
  resolveUpgradedPricingSchedule,
  validatePricingUpdate,
} from "../services/pricingService.js";
import {
  buildProviderCostPreviews,
  validatePeyflexPricingUpdate,
} from "../services/providerPricingService.js";
import TierPolicy from "../models/TierPolicy.js";
import { buildPaystackDvaReadiness } from "../services/paystackDvaReadinessService.js";

const TIER_LIMIT_FIELDS = [
  "minimumAmount",
  "maximumPerTransaction",
  "maximumOutgoingPerDay",
  "maximumOutgoingCountPerDay",
  "maximumWalletBalance",
  "maximumFundingPerTransaction",
  "maximumFundingPerDay",
  "maximumWithdrawalPerTransaction",
  "maximumWithdrawalPerDay",
  "maximumWithdrawalCountPerDay",
];

export const validateTransactionPolicyLimits = (tiers) => {
  if (!tiers || typeof tiers !== "object" || Array.isArray(tiers) || !Object.keys(tiers).length) {
    throw new Error("Provide transaction limits for at least one KYC tier.");
  }
  for (const [tierName, limits] of Object.entries(tiers)) {
    if (!["tier1", "tier2", "tier3"].includes(tierName) ||
      !limits || typeof limits !== "object" || Array.isArray(limits) || !Object.keys(limits).length) {
      throw new Error("Only non-empty tier1, tier2, or tier3 limit objects are accepted.");
    }
    for (const [field, value] of Object.entries(limits)) {
      if (!TIER_LIMIT_FIELDS.includes(field)) {
        throw new Error(`Unsupported transaction policy field: ${field}.`);
      }
      if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
        throw new Error(`${tierName}.${field} must be a non-negative whole-number amount or null.`);
      }
      if (field.endsWith("CountPerDay") && value !== null && !Number.isSafeInteger(value)) {
        throw new Error(`${tierName}.${field} must be a non-negative whole number or null.`);
      }
    }
  }
};

// GET /api/admin/settings
// Returns everything except raw credential values (those are write-only from the API;
// getCredentialStatus tells the admin panel what's configured without exposing secrets)
export const getBusinessSettings = async (req, res) => {
  try {
    const settings = await getSettings();
    const [credentialStatus, transactionPolicy] = await Promise.all([
      getCredentialStatus(),
      TierPolicy.findOne({ key: "customer_transaction_policy" }).lean(),
    ]);

    const plain = settings.toObject();
    delete plain.apiCredentials; // never send raw/encrypted credential blobs to the client
    plain.transferFees.wallet.lowerFee = 0;
    plain.transferFees.wallet.higherFee = 0;

    res.json({
      success: true,
      settings: plain,
      credentials: credentialStatus,
      dvaReadiness: buildPaystackDvaReadiness({
        credentials: credentialStatus,
        policy: transactionPolicy,
      }),
      providerCostPreviews: buildProviderCostPreviews(settings),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/admin/settings/pricing
// body: { pricing: { data: { normal: 50 }, ... } } - any subset, deep-merged
export const updatePricing = async (req, res) => {
  const { pricing: incomingPricing, peyflexPricing: incomingPeyflexPricing } = req.body;
  if (!incomingPricing && !incomingPeyflexPricing) {
    return res.status(400).json({ message: "pricing or peyflexPricing is required" });
  }

  if (incomingPricing) {
    try {
      validatePricingUpdate(incomingPricing);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  }

  let pricing = incomingPricing;
  if (incomingPricing.upgraded) {
    let settingsBeforeUpdate;
    try {
      settingsBeforeUpdate = await getSettings();
    } catch {
      return res.status(500).json({ message: "Could not load the current upgraded pricing configuration." });
    }
    try {
      pricing = {
        ...incomingPricing,
        upgraded: resolveUpgradedPricingSchedule(
          settingsBeforeUpdate.pricing.upgraded.configured,
          incomingPricing.upgraded
        ),
      };
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  }

  let peyflexPricing = incomingPeyflexPricing;
  if (incomingPeyflexPricing) {
    try {
      validatePeyflexPricingUpdate(incomingPeyflexPricing);
      if (incomingPeyflexPricing.costEntries) {
        peyflexPricing = {
          ...incomingPeyflexPricing,
          costEntries: incomingPeyflexPricing.costEntries.map((entry) => ({
            ...entry,
            updatedAt: new Date(),
          })),
        };
      }
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  }

  try {
    const update = {
      ...(pricing ? { pricing } : {}),
      ...(peyflexPricing ? { peyflexPricing } : {}),
    };
    const settings = await updateSettings(update);
    await logAdminActivity({
      admin: req.user,
      action: "pricing_updated",
      description: "Updated VTU selling prices or admin-managed Peyflex costs/entitlement.",
      req,
    });
    res.json({
      success: true,
      pricing: settings.pricing,
      peyflexPricing: settings.peyflexPricing,
      providerCostPreviews: buildProviderCostPreviews(settings),
    });
  } catch (err) {
    console.error("VTU pricing update failed:", err.code || err.name || "unclassified_error");
    res.status(500).json({ message: "Could not update VTU pricing." });
  }
};

// PATCH /api/admin/settings/upgrade-fees
// body: { upgrade: { retailFee: 3500, ... } }
export const updateUpgradeFees = async (req, res) => {
  const { upgradeFee } = req.body;
  if (!Number.isSafeInteger(upgradeFee) || upgradeFee < 1500) {
    return res.status(400).json({ message: "Upgrade fee must be a whole-number amount of at least ₦1,500." });
  }
  try {
    const settings = await updateSettings({ upgradeFee });
    await logAdminActivity({
      admin: req.user,
      action: "upgrade_fee_updated",
      description: `Updated SwiftVault membership fee to ₦${upgradeFee}. Eligible referrer commission remains ₦1,500.`,
      req,
    });
    return res.json({ success: true, upgradeFee: settings.upgradeFee });
  } catch (err) {
    console.error("Upgrade fee update failed:", err.code || err.name || "unclassified_error");
    return res.status(500).json({ message: "Could not update the upgrade fee." });
  }
};

// PATCH /api/admin/settings/transfer-fees
// body: { transferFees: { wallet: {...}, bank: {...} } }
export const updateTransferFees = async (req, res) => {
  try {
    const { transferFees } = req.body;
    if (!transferFees || typeof transferFees !== "object" || Array.isArray(transferFees)) {
      return res.status(400).json({ message: "transferFees object is required" });
    }
    const walletFees = transferFees.wallet;
    if (walletFees !== undefined && (!walletFees || typeof walletFees !== "object" || Array.isArray(walletFees))) {
      return res.status(400).json({ message: "wallet transfer fees must be an object." });
    }
    if (walletFees && ["lowerFee", "higherFee"].some((key) => walletFees[key] !== undefined && walletFees[key] !== 0)) {
      return res.status(400).json({ message: "SwiftVault-to-SwiftVault transfers must remain zero-fee." });
    }
    const settings = await updateSettings({
      transferFees: {
        ...transferFees,
        wallet: { ...(walletFees || {}), lowerFee: 0, higherFee: 0 },
      },
    });
    await logAdminActivity({ admin: req.user, action: "transfer_fees_updated", description: `Updated transfer fees: ${JSON.stringify(transferFees)}`, req });
    res.json({ success: true, transferFees: settings.transferFees });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const createUpdateTransactionPolicyLimitsHandler = ({
  TierPolicyModel = TierPolicy,
  logActivity = logAdminActivity,
} = {}) => async (req, res) => {
  const { tiers } = req.body || {};
  try {
    validateTransactionPolicyLimits(tiers);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  try {
    let policy = await TierPolicyModel.findOne({ key: "customer_transaction_policy" });
    if (!policy) policy = new TierPolicyModel({ key: "customer_transaction_policy" });

    for (const [tierName, limits] of Object.entries(tiers)) {
      for (const [field, value] of Object.entries(limits)) {
        policy[tierName][field] = value;
      }
    }

    policy.approved = false;
    policy.enforcementEnabled = false;
    policy.approvalReference = null;
    policy.approvedAt = null;
    policy.approvedBy = null;
    policy.dailyTimeZone = null;
    await policy.save();
    await logActivity({
      admin: req.user,
      action: "transaction_policy_limits_updated",
      description: "Updated KYC-tier transaction limits. Policy approval and enforcement remain disabled.",
      req,
    });

    return res.json({
      success: true,
      message: "Tier limits saved. They remain inactive until separately approved.",
      tiers: [1, 2, 3].map((tier) => ({
        tier,
        ...Object.fromEntries(TIER_LIMIT_FIELDS.map((field) => [field, policy[`tier${tier}`][field] ?? null])),
      })),
      approved: false,
      enforcementEnabled: false,
    });
  } catch (error) {
    console.error("Transaction policy limit update failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Transaction policy limits could not be saved." });
  }
};

export const updateTransactionPolicyLimits = createUpdateTransactionPolicyLimitsHandler();

// PATCH /api/admin/settings/services
// body: { services: { airtime: false, data: true, ... } } - toggle any subset
export const updateServiceToggles = async (req, res) => {
  try {
    const { services } = req.body;
    if (!services || typeof services !== "object" || Array.isArray(services)) {
      return res.status(400).json({ message: "services object is required" });
    }
    if (Object.hasOwn(services, "bankTransfer")) {
      return res.status(400).json({ message: "Bank transfers are unavailable until an approved payout provider is configured." });
    }
    const settings = await updateSettings({ services });
    await logAdminActivity({ admin: req.user, action: "service_toggle_updated", description: `Updated service availability: ${JSON.stringify(services)}`, req });
    res.json({ success: true, services: settings.services });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/settings/system/public - safe to expose publicly, contains no sensitive data.
// Used for site branding (logo, name) that needs to show even before login.
export const getPublicSystemSettings = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({ success: true, system: settings.system });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/settings/system
// body: { system: { siteName, logoUrl, faviconUrl, supportEmail, supportPhone, maintenanceMode, seoTitle, seoDescription } }
export const updateSystemSettings = async (req, res) => {
  try {
    const { system } = req.body;
    if (!system) return res.status(400).json({ message: "system object is required" });
    const settings = await updateSettings({ system });
    await logAdminActivity({ admin: req.user, action: "system_settings_updated", description: `Updated system settings (site name, branding, or SEO)`, req });
    res.json({ success: true, system: settings.system });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- Company bank accounts ---

// POST /api/admin/settings/bank-accounts
export const createBankAccount = async (req, res) => {
  try {
    const { bankName, bankCode, accountName, accountNumber, accountType, status } = req.body;
    if (!bankName || !bankCode || !accountName || !accountNumber) {
      return res.status(400).json({ message: "bankName, bankCode, accountName, and accountNumber are required" });
    }
    const settings = await addCompanyBankAccount({ bankName, bankCode, accountName, accountNumber, accountType, status });
    await logAdminActivity({ admin: req.user, action: "bank_account_added", description: `Added company bank account: ${bankName} - ${accountNumber}`, req });
    res.json({ success: true, companyBankAccounts: settings.companyBankAccounts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/admin/settings/bank-accounts/:id
export const editBankAccount = async (req, res) => {
  try {
    const settings = await updateCompanyBankAccount(req.params.id, req.body);
    await logAdminActivity({ admin: req.user, action: "bank_account_updated", description: `Updated company bank account ${req.params.id}`, req });
    res.json({ success: true, companyBankAccounts: settings.companyBankAccounts });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/admin/settings/bank-accounts/:id
export const deleteBankAccount = async (req, res) => {
  try {
    const settings = await removeCompanyBankAccount(req.params.id);
    await logAdminActivity({ admin: req.user, action: "bank_account_removed", description: `Removed company bank account ${req.params.id}`, req });
    res.json({ success: true, companyBankAccounts: settings.companyBankAccounts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/settings/bank-accounts/active - also exposed to normal users, see settingsRoutes.js
export const listActiveBankAccounts = async (req, res) => {
  try {
    const accounts = await getActiveCompanyBankAccounts();
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- API credentials ---

// PATCH /api/admin/settings/credentials
// Credential values are write-only and never returned to the client.
export const updateApiCredential = async (req, res) => {
  try {
    const { key, value } = req.body;
    const validKeys = [
      "termiiApiKey",
      "paystackSecretKey",
      "paystackPublicKey",
      "peyflexApiToken",
      "peyflexBaseUrl",
    ];
    if (!validKeys.includes(key)) {
      return res.status(400).json({ message: `Invalid credential key. Must be one of: ${validKeys.join(", ")}` });
    }
    await setCredential(key, value);
    await logAdminActivity({ admin: req.user, action: "api_credential_changed", description: `Updated credential: ${key} (value not logged)`, req });
    const credentialStatus = await getCredentialStatus();
    res.json({ success: true, message: `${key} updated successfully`, credentials: credentialStatus });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
