import { getSettings } from "./settingsService.js";
import { calculatePrice } from "./pricingService.js";

const SERVICES = new Set(["airtime", "data", "cable", "electricity", "epin", "education"]);
const PRICING_TYPES = {
  airtime: "airtime",
  data: "data",
  cable: "cable",
  electricity: "electricity",
  epin: "epin",
  education: "educational",
};
const SENSITIVE_EVIDENCE = /bearer\s|api[_ -]?key|secret|password|authorization|\btoken\b|[{}]/i;

const normalizeIdentity = (value) => String(value ?? "").trim().toLowerCase();

export const providerCostKey = ({ service, provider, product }) =>
  [service, provider, product].map(normalizeIdentity).join("|");

export const validatePeyflexPricingUpdate = (configuration) => {
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    throw new Error("peyflexPricing must be an object.");
  }
  const allowedFields = new Set(["providerEntitlement", "costEntries"]);
  for (const field of Object.keys(configuration)) {
    if (!allowedFields.has(field)) throw new Error(`Unsupported Peyflex pricing setting: ${field}.`);
  }

  if (configuration.providerEntitlement !== undefined) {
    const entitlement = configuration.providerEntitlement;
    if (!entitlement || typeof entitlement !== "object" || Array.isArray(entitlement)) {
      throw new Error("providerEntitlement must be an object.");
    }
    const allowedEntitlementFields = new Set(["status", "evidenceReference", "verifiedAt"]);
    for (const field of Object.keys(entitlement)) {
      if (!allowedEntitlementFields.has(field)) throw new Error(`Unsupported provider entitlement field: ${field}.`);
    }
    if (!["unknown", "standard_api_discount", "top_reseller"].includes(entitlement.status)) {
      throw new Error("Provider entitlement status is invalid.");
    }
    if (entitlement.status !== "unknown" &&
      (!String(entitlement.evidenceReference || "").trim() ||
        SENSITIVE_EVIDENCE.test(entitlement.evidenceReference) ||
        !Number.isFinite(Date.parse(entitlement.verifiedAt)) ||
        Date.parse(entitlement.verifiedAt) > Date.now())) {
      throw new Error("A verified entitlement requires a safe evidence reference and verification date.");
    }
  }

  if (configuration.costEntries !== undefined) {
    if (!Array.isArray(configuration.costEntries)) throw new Error("costEntries must be an array.");
    const keys = new Set();
    for (const entry of configuration.costEntries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error("Each provider cost entry must be an object.");
      }
      const allowedEntryFields = new Set([
        "service", "provider", "product", "providerCost", "providerFee", "validUntil", "evidenceReference",
      ]);
      for (const field of Object.keys(entry)) {
        if (!allowedEntryFields.has(field)) throw new Error(`Unsupported provider cost field: ${field}.`);
      }
      if (!SERVICES.has(entry.service) || !String(entry.provider || "").trim() ||
        !String(entry.product || "").trim()) {
        throw new Error("Each provider cost entry requires a supported service, provider, and product.");
      }
      if (!Number.isFinite(Number(entry.providerCost)) || Number(entry.providerCost) <= 0 ||
        !Number.isFinite(Number(entry.providerFee ?? 0)) || Number(entry.providerFee ?? 0) < 0) {
        throw new Error("Provider cost must be positive and provider fees must be non-negative.");
      }
      if (!Number.isFinite(Date.parse(entry.validUntil)) || Date.parse(entry.validUntil) <= Date.now()) {
        throw new Error("Each provider cost entry must have a future validUntil date.");
      }
      const evidence = String(entry.evidenceReference || "").trim();
      if (!evidence || evidence.length > 200 || SENSITIVE_EVIDENCE.test(evidence)) {
        throw new Error("Each provider cost entry requires a safe evidence reference.");
      }
      const key = providerCostKey(entry);
      if (keys.has(key)) throw new Error("Provider cost entries must have unique service/provider/product identities.");
      keys.add(key);
    }
  }
};

export const calculateManagedProviderPrice = ({
  settings,
  service,
  provider,
  product,
  units = 1,
  user,
  now = new Date(),
}) => {
  if (!SERVICES.has(service) || !Number.isSafeInteger(units) || units < 1) {
    throw new Error("A valid Peyflex service and quantity are required.");
  }

  const key = providerCostKey({ service, provider, product });
  const entry = settings.peyflexPricing?.costEntries?.find(
    (candidate) => providerCostKey(candidate) === key
  );
  if (!entry) throw new Error("No admin-managed provider cost is configured for this product.");
  if (new Date(entry.validUntil) <= now) {
    throw new Error("The configured provider cost has expired. Contact support before retrying.");
  }

  const unitProviderCost = Number(entry.providerCost);
  const unitProviderFee = Number(entry.providerFee || 0);
  if (!Number.isFinite(unitProviderCost) || unitProviderCost <= 0 ||
    !Number.isFinite(unitProviderFee) || unitProviderFee < 0) {
    throw new Error("The configured provider cost or fee is invalid. Contact support before retrying.");
  }
  const providerCost = unitProviderCost * units;
  const providerFee = unitProviderFee * units;
  const pricingBase = unitProviderCost + unitProviderFee;
  const normalSellingPrice = calculatePrice({
    pricing: settings.pricing,
    serviceType: PRICING_TYPES[service],
    baseCost: pricingBase,
    isUpgraded: false,
  });
  const upgradedSellingPrice = calculatePrice({
    pricing: settings.pricing,
    serviceType: PRICING_TYPES[service],
    baseCost: pricingBase,
    isUpgraded: true,
  });
  const usesUpgradedPricing = user?.isUpgraded === true &&
    settings.pricing.upgraded?.configured === true &&
    settings.pricing.upgraded?.enabled === true;
  const sellingPrice = usesUpgradedPricing ? upgradedSellingPrice : normalSellingPrice;

  return {
    sellingPrice: sellingPrice * units,
    providerCost,
    providerFee,
    pricingSnapshot: {
      service,
      provider: entry.provider,
      product: entry.product,
      providerEntitlement: {
        status: settings.peyflexPricing?.providerEntitlement?.status || "unknown",
        evidenceReference: settings.peyflexPricing?.providerEntitlement?.evidenceReference || "",
        verifiedAt: settings.peyflexPricing?.providerEntitlement?.verifiedAt || null,
      },
      providerCost: entry.providerCost,
      providerFee: entry.providerFee || 0,
      units,
      costUpdatedAt: entry.updatedAt,
      validUntil: entry.validUntil,
      evidenceReference: entry.evidenceReference,
      normalSellingPrice: normalSellingPrice * units,
      upgradedSellingPrice: upgradedSellingPrice * units,
      appliedSchedule: usesUpgradedPricing ? "upgraded" : "normal",
      providerChargeStatus: "configured_estimate",
      estimatedGrossMargin: sellingPrice * units - providerCost - providerFee,
    },
  };
};

export const resolveManagedProviderPrice = async (options) => {
  const settings = await getSettings();
  return calculateManagedProviderPrice({ ...options, settings });
};

export const previewManagedProviderPrice = async ({
  service,
  provider,
  product,
  user,
  now = new Date(),
}) => {
  const settings = await getSettings();
  const key = providerCostKey({ service, provider, product });
  const entry = settings.peyflexPricing?.costEntries?.find(
    (candidate) => providerCostKey(candidate) === key
  );
  if (!entry) return { sellingPrice: null, pricingStatus: "cost_unconfigured" };
  if (new Date(entry.validUntil) <= now) {
    return { sellingPrice: null, pricingStatus: "cost_expired" };
  }

  const quote = calculateManagedProviderPrice({
    settings,
    service,
    provider,
    product,
    user,
    now,
  });
  return { sellingPrice: quote.sellingPrice, pricingStatus: "available" };
};

export const buildProviderCostPreviews = (settings) => {
  const entries = settings.peyflexPricing?.costEntries || [];
  return entries.map((entry) => {
    const providerCost = Number(entry.providerCost);
    const providerFee = Number(entry.providerFee || 0);
    const baseCost = providerCost + providerFee;
    const serviceType = PRICING_TYPES[entry.service];
    const normalSellingPrice = calculatePrice({
      pricing: settings.pricing,
      serviceType,
      baseCost,
      isUpgraded: false,
    });
    const upgradedSellingPrice = calculatePrice({
      pricing: settings.pricing,
      serviceType,
      baseCost,
      isUpgraded: true,
    });
    return {
      service: entry.service,
      provider: entry.provider,
      product: entry.product,
      providerCost,
      providerFee,
      normalSellingPrice,
      upgradedSellingPrice,
      normalEstimatedGrossMargin: normalSellingPrice - baseCost,
      upgradedEstimatedGrossMargin: upgradedSellingPrice - baseCost,
      validUntil: entry.validUntil,
      stale: new Date(entry.validUntil) <= new Date(),
    };
  });
};
