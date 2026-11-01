import KycProfile from "../models/KycProfile.js";
import TierPolicy from "../models/TierPolicy.js";

export const TRANSACTION_POLICY_ENFORCEMENT_READY = false;
export const KYC_REQUIREMENTS_APPROVED = Object.freeze({
  tier1: false,
  tier1NinConsistencyRequired: null,
  tier1BvnNameMatchRequired: null,
  tier2: false,
  tier3: false,
  tier3AddressRequired: null,
  tier3SupportingDocumentsRequired: null,
});

export const KYC_CAPABILITIES = Object.freeze({
  bvn: "UNCONFIGURED",
  bvnDateOfBirthMatch: "UNCONFIGURED",
  bvnNameMatch: "UNCONFIGURED",
  nin: "UNCONFIGURED",
  ninIdentityMatch: "UNCONFIGURED",
  faceLiveness: "UNCONFIGURED",
});

export const KYC_REQUIREMENTS = Object.freeze({
  1: [
    { key: "bvn", label: "BVN verification", capability: KYC_CAPABILITIES.bvn },
    { key: "dateOfBirthMatch", label: "Date-of-birth match", capability: KYC_CAPABILITIES.bvnDateOfBirthMatch },
    { key: "bvnNameMatch", label: "BVN name match (if required)", capability: KYC_CAPABILITIES.bvnNameMatch },
    { key: "ninConsistency", label: "NIN consistency (if required and lawfully available)", capability: KYC_CAPABILITIES.nin },
    { key: "faceLiveness", label: "Face verification and liveness", capability: KYC_CAPABILITIES.faceLiveness },
  ],
  2: [
    { key: "nin", label: "NIN verification", capability: KYC_CAPABILITIES.nin },
    { key: "identityMatch", label: "Authoritative identity match", capability: KYC_CAPABILITIES.ninIdentityMatch },
  ],
  3: [
    { key: "address", label: "Residential address (if required; scope unconfirmed)", capability: "UNCONFIGURED" },
    { key: "supportingDocuments", label: "Supporting documents (if required; scope unconfirmed)", capability: "UNCONFIGURED" },
    { key: "manualReview", label: "Authorized compliance review", capability: "UNCONFIGURED" },
  ],
});

export const getPolicyConfigurationBlockReason = (policy, action, tierNumber = null) => {
  if (!policy || policy.approved !== true || policy.enforcementEnabled !== true) {
    return "An approved transaction policy has not been configured.";
  }
  if (!policy.approvalReference || !policy.approvedAt || !policy.approvedBy) {
    return "The transaction policy approval record is incomplete.";
  }
  if (!policy.dailyTimeZone) {
    return "The daily transaction accounting timezone has not been approved.";
  }

  const requiredFields = {
    transfer: ["maximumPerTransaction", "maximumOutgoingPerDay", "maximumOutgoingCountPerDay"],
    service: ["maximumPerTransaction", "maximumOutgoingPerDay", "maximumOutgoingCountPerDay"],
    funding: ["maximumFundingPerTransaction", "maximumFundingPerDay", "maximumWalletBalance"],
    withdrawal: ["maximumWithdrawalPerTransaction", "maximumWithdrawalPerDay", "maximumWithdrawalCountPerDay"],
    membership: ["maximumPerTransaction", "maximumOutgoingPerDay", "maximumOutgoingCountPerDay"],
  }[action];
  if (!requiredFields) return "This transaction type is not approved.";

  const tiers = tierNumber ? [policy[`tier${tierNumber}`]] : [policy.tier1, policy.tier2, policy.tier3];
  if (tiers.some((tier) => !tier || !requiredFields.every((field) => Number.isFinite(tier[field]) && tier[field] >= 0))) {
    return "Approved limits for this transaction type are unavailable.";
  }

  return null;
};

export const getPolicyBlockReason = (policy, action, tierNumber = null) => {
  const configurationError = getPolicyConfigurationBlockReason(policy, action, tierNumber);
  if (configurationError) return configurationError;
  if (!TRANSACTION_POLICY_ENFORCEMENT_READY) {
    return "Atomic daily transaction reservations are not enabled.";
  }
  return null;
};

export const getFundingHoldReason = ({ user, tier, policy, amount, fundingMethod = "paystack" }) => {
  if (!user) return "account_unmatched";
  if (user.isSuspended) return "account_suspended";
  if (!tier) return "verification_required";

  const tierPolicy = policy?.[`tier${tier}`];
  if (
    Number.isFinite(tierPolicy?.minimumAmount) &&
    amount < tierPolicy.minimumAmount
  ) {
    return "funding_amount_below_minimum";
  }
  if (
    Number.isFinite(tierPolicy?.maximumFundingPerTransaction) &&
    amount > tierPolicy.maximumFundingPerTransaction
  ) {
    return "funding_transaction_limit";
  }
  if (
    Number.isFinite(tierPolicy?.maximumWalletBalance) &&
    (Number(user.walletBalance) || 0) + amount > tierPolicy.maximumWalletBalance
  ) {
    return "wallet_balance_limit";
  }
  if (tierPolicy?.fundingMethods?.includes(fundingMethod) !== true) {
    return "funding_policy_unconfigured";
  }

  const policyError = getPolicyBlockReason(policy, "funding", tier);
  if (policyError) return "funding_policy_unconfigured";

  return null;
};

export const areTierOneChecksVerified = (profile, requirements = KYC_REQUIREMENTS_APPROVED) =>
  requirements.tier1 === true &&
  typeof requirements.tier1NinConsistencyRequired === "boolean" &&
  typeof requirements.tier1BvnNameMatchRequired === "boolean" &&
  profile?.tier1?.status === "verified" &&
  profile?.tier1?.bvn === "verified" &&
  profile?.tier1?.dateOfBirthMatch === "verified" &&
  (!requirements.tier1NinConsistencyRequired || profile?.tier1?.ninConsistency === "verified") &&
  (!requirements.tier1BvnNameMatchRequired || profile?.tier1?.bvnNameMatch === "verified") &&
  profile?.tier1?.faceLiveness === "verified";

const hasVerifiedTierTwo = (profile, requirements = KYC_REQUIREMENTS_APPROVED) =>
  areTierOneChecksVerified(profile, requirements) &&
  requirements.tier2 === true &&
  profile?.tier2?.status === "verified" &&
  profile?.tier2?.nin === "verified" &&
  profile?.tier2?.identityMatch === "verified";

export const canApproveTierThree = (profile, requirements = KYC_REQUIREMENTS_APPROVED) =>
  requirements.tier3 === true &&
  typeof requirements.tier3AddressRequired === "boolean" &&
  typeof requirements.tier3SupportingDocumentsRequired === "boolean" &&
  (!requirements.tier3AddressRequired || profile?.tier3?.address === "verified") &&
  (!requirements.tier3SupportingDocumentsRequired || profile?.tier3?.supportingDocuments === "verified") &&
  hasVerifiedTierTwo(profile, requirements);

export const getCurrentKycTier = (profile, requirements = KYC_REQUIREMENTS_APPROVED) => {
  if (!areTierOneChecksVerified(profile, requirements)) return 0;
  if (hasVerifiedTierTwo(profile, requirements)) {
    if (
      profile?.tier3?.status === "verified" &&
      profile?.tier3?.manualReview === "verified" &&
      canApproveTierThree(profile, requirements)
    ) return 3;
    return 2;
  }
  return 1;
};

export const getOrCreateKycProfile = async (userId) =>
  KycProfile.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

export const getTransactionPolicy = async () => TierPolicy.findOne({ key: "customer_transaction_policy" }).lean();
