import mongoose from "mongoose";

// Singleton document - there should only ever be one Settings record.
// This is the single source of truth for everything that used to be
// hardcoded across config/financials.js, pricingService.js, and various
// controllers. Existing default values below match what was previously
// hardcoded, so behavior is unchanged until an admin edits something.
const settingsSchema = new mongoose.Schema(
  {
    // --- Legacy fields (kept for backward compatibility with existing code) ---
    welcomeBonus: { type: Number, default: 100 },
    welcomeBonusEnabled: { type: Boolean, default: false },
    welcomeBonusEnabledAt: { type: Date, default: null },
    upgradeFee: { type: Number, default: 3000 },
    referralUpgradeReward: { type: Number, default: 500 },

    // --- Account upgrade tier pricing (was hardcoded in upgradeController.js) ---
    upgrade: {
      retailFee: { type: Number, default: 3000 },
      wholesaleFee: { type: Number, default: 5000 },
      retailToWholesaleFee: { type: Number, default: 2000 },
      retailReferralReward: { type: Number, default: 1000 },
      wholesaleReferralReward: { type: Number, default: 1500 },
    },

    // --- VTU pricing markups (was hardcoded in pricingService.js) ---
    pricing: {
      data: {
        normal: { type: Number, default: 44 },
        retail: { type: Number, default: 24 },
        wholesale: { type: Number, default: 9 },
      },
      // Airtime uses multipliers, not flat markups (matches original logic)
      airtime: {
        normal: { type: Number, default: 1.0 },
        retail: { type: Number, default: 0.995 },
        wholesale: { type: Number, default: 0.990 },
      },
      cable: {
        normal: { type: Number, default: 100 },
        retail: { type: Number, default: 50 },
        wholesale: { type: Number, default: 20 },
      },
      electricity: {
        normal: { type: Number, default: 100 },
        retail: { type: Number, default: 50 },
        wholesale: { type: Number, default: 20 },
      },
      educational: {
        normal: { type: Number, default: 200 },
        retail: { type: Number, default: 90 },
        wholesale: { type: Number, default: 30 },
      },
      // epin has fixed-bracket pricing in the original logic - kept as multipliers
      // for retail/wholesale, with normal-tier brackets left as-is (rare to need
      // per-bracket admin editing; can be extended later if needed).
      epin: {
        normalMultiplier: { type: Number, default: 1.01 },
        retailMultiplier: { type: Number, default: 1.005 },
        wholesaleMultiplier: { type: Number, default: 1.0 },
      },
      upgraded: {
        configured: { type: Boolean, default: false },
        enabled: { type: Boolean, default: false },
        data: { type: Number, default: 44 },
        airtime: { type: Number, default: 1.0 },
        cable: { type: Number, default: 100 },
        electricity: { type: Number, default: 100 },
        educational: { type: Number, default: 200 },
        epinMultiplier: { type: Number, default: 1.01 },
      },
    },

    peyflexPricing: {
      providerEntitlement: {
        status: {
          type: String,
          enum: ["unknown", "standard_api_discount", "top_reseller"],
          default: "unknown",
        },
        evidenceReference: { type: String, default: "" },
        verifiedAt: { type: Date, default: null },
      },
      costEntries: {
        type: [{
          service: {
            type: String,
            enum: ["airtime", "data", "cable", "electricity", "epin", "education"],
            required: true,
          },
          provider: { type: String, required: true },
          product: { type: String, required: true },
          providerCost: { type: Number, required: true },
          providerFee: { type: Number, default: 0 },
          validUntil: { type: Date, required: true },
          evidenceReference: { type: String, required: true },
          updatedAt: { type: Date, default: Date.now },
        }],
        default: [],
      },
    },

    // --- Transfer fee settings (bank transfer fees are retained for legacy records) ---
    transferFees: {
      wallet: {
        // amount > threshold uses higherFee, otherwise lowerFee
        threshold: { type: Number, default: 5000 },
        lowerFee: { type: Number, default: 0 },
        higherFee: { type: Number, default: 0 },
      },
      bank: {
        tier1Max: { type: Number, default: 5000 },
        tier1Fee: { type: Number, default: 10 },
        tier2Max: { type: Number, default: 50000 },
        tier2Fee: { type: Number, default: 25 },
        tier3Fee: { type: Number, default: 50 }, // above tier2Max
      },
    },

    // --- Service enable/disable toggles ---
    services: {
      data: { type: Boolean, default: true },
      airtime: { type: Boolean, default: true },
      cable: { type: Boolean, default: true },
      electricity: { type: Boolean, default: true },
      epin: { type: Boolean, default: true },
      education: { type: Boolean, default: true },
      betting: { type: Boolean, default: true },
      walletTransfer: { type: Boolean, default: true },
      bankTransfer: { type: Boolean, default: false },
      walletFunding: { type: Boolean, default: true },
    },

    // --- Company bank accounts shown to users for manual funding ---
    companyBankAccounts: [
      {
        bankName: { type: String, required: true },
        bankCode: { type: String, required: true },
        accountName: { type: String, required: true },
        accountNumber: { type: String, required: true },
        accountType: { type: String, default: "Current" },
        status: { type: String, enum: ["active", "inactive"], default: "active" },
      },
    ],

    // --- System settings: site identity + SEO (no file upload exists in this backend,
    // so logo/favicon are stored as URLs to externally-hosted images, not uploaded files) ---
    system: {
      siteName: { type: String, default: "SwiftVault" },
      logoUrl: { type: String, default: "" },
      faviconUrl: { type: String, default: "" },
      supportEmail: { type: String, default: "" },
      supportPhone: { type: String, default: "" },
      maintenanceMode: { type: Boolean, default: false },
      seoTitle: { type: String, default: "SwiftVault - Fast, Secure Digital Wallet" },
      seoDescription: { type: String, default: "Send money, pay bills, and manage your finances with SwiftVault." },
    },

    // --- API credentials (encrypted at rest) ---
    // Each value is stored as an encrypted string via utils/encryption.js.
    // If left empty, the corresponding process.env value is used instead -
    // so nothing breaks for existing setups until an admin explicitly sets one here.
    apiCredentials: {
      termiiApiKey: { type: String, default: "" },
      paystackSecretKey: { type: String, default: "" },
      paystackPublicKey: { type: String, default: "" },
      peyflexApiToken: { type: String, default: "" },
      peyflexBaseUrl: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Settings", settingsSchema);
