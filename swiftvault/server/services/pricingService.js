import { getSettings } from "./settingsService.js";

const PRICE_GROUPS = {
  data: ["normal"],
  airtime: ["normal"],
  cable: ["normal"],
  electricity: ["normal"],
  educational: ["normal"],
  epin: ["normalMultiplier"],
  upgraded: [
    "enabled",
    "data",
    "airtime",
    "cable",
    "electricity",
    "educational",
    "epinMultiplier",
  ],
};
const UPGRADED_SCHEDULE_FIELDS = [
  "data",
  "airtime",
  "cable",
  "electricity",
  "educational",
  "epinMultiplier",
];

export const resolveUpgradedPricingSchedule = (alreadyConfigured, update) => {
  const complete = UPGRADED_SCHEDULE_FIELDS.every((key) =>
    Object.prototype.hasOwnProperty.call(update, key)
  );
  const configured = alreadyConfigured || complete;
  if (update.enabled === true && !configured) {
    throw new Error("Provide the complete upgraded pricing schedule before enabling it.");
  }
  return { ...update, configured };
};

export const validatePricingUpdate = (pricing) => {
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) {
    throw new Error("pricing must be an object.");
  }

  for (const [group, values] of Object.entries(pricing)) {
    if (!PRICE_GROUPS[group] || !values || typeof values !== "object" || Array.isArray(values)) {
      throw new Error(`Unsupported pricing setting: ${group}.`);
    }
    for (const [key, value] of Object.entries(values)) {
      if (!PRICE_GROUPS[group].includes(key)) {
        throw new Error(`Unsupported ${group} pricing setting: ${key}.`);
      }
      if (group === "upgraded" && key === "enabled") {
        if (typeof value !== "boolean") throw new Error("Upgraded pricing enabled must be a boolean.");
        continue;
      }
      const minimum = key.toLowerCase().includes("multiplier") || group === "airtime" || group === "upgraded" && key === "airtime" ? 1 : 0;
      if (!Number.isFinite(Number(value)) || Number(value) < minimum) {
        throw new Error(`${group}.${key} must be a finite number no lower than ${minimum}.`);
      }
    }
  }
};

export const calculatePrice = ({ pricing, serviceType, baseCost, isUpgraded = false }) => {
  const cost = Number(baseCost);
  if (!Number.isFinite(cost) || cost <= 0) throw new Error("Provider cost must be a positive finite amount.");

  const useUpgradedPricing = Boolean(
    isUpgraded && pricing.upgraded?.configured === true && pricing.upgraded?.enabled === true
  );
  const profile = useUpgradedPricing ? pricing.upgraded : null;
  let finalPrice;

  switch (serviceType) {
    case "data":
      finalPrice = cost + (profile ? profile.data : pricing.data.normal);
      break;
    case "airtime":
      finalPrice = cost * (profile ? profile.airtime : pricing.airtime.normal);
      break;
    case "cable":
    case "electricity":
      finalPrice = cost + (profile ? profile[serviceType] : pricing[serviceType].normal);
      break;
    case "educational":
      finalPrice = cost + (profile ? profile.educational : pricing.educational.normal);
      break;
    case "epin": {
      if (profile) {
        finalPrice = cost * profile.epinMultiplier;
      } else if (cost >= 90 && cost <= 100) {
        finalPrice = 100;
      } else if (cost >= 180 && cost <= 200) {
        finalPrice = 200;
      } else if (cost >= 280 && cost <= 300) {
        finalPrice = 300;
      } else if (cost >= 480 && cost <= 500) {
        finalPrice = 500;
      } else {
        finalPrice = cost * pricing.epin.normalMultiplier;
      }
      break;
    }
    default:
      throw new Error(`Unsupported VTU service type: ${serviceType}.`);
  }

  if (!Number.isFinite(finalPrice) || finalPrice < cost) {
    throw new Error("Configured selling price cannot be lower than provider cost.");
  }
  return Math.ceil(finalPrice);
};

export const computePrice = async (serviceType, baseCost, user = {}) => {
  const settings = await getSettings();
  return calculatePrice({
    pricing: settings.pricing,
    serviceType,
    baseCost,
    isUpgraded: user.isUpgraded === true,
  });
};
