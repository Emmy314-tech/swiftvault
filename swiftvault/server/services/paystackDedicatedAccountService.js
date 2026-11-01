import User from "../models/User.js";
import {
  getCurrentKycTier,
  getPolicyBlockReason,
  KYC_CAPABILITIES,
  KYC_REQUIREMENTS_APPROVED,
} from "./kycPolicyService.js";
import { isPaystackLivePaymentsEnabled } from "./paystackGateway.js";

export const getUnconfiguredPaystackDvaKycCapabilities = (
  tier,
  capabilities = KYC_CAPABILITIES,
  requirements = KYC_REQUIREMENTS_APPROVED,
) => {
  const required = new Set(["bvn", "bvnDateOfBirthMatch", "faceLiveness"]);
  if (requirements.tier1BvnNameMatchRequired === true) required.add("bvnNameMatch");
  if (requirements.tier1NinConsistencyRequired === true || tier >= 2) required.add("nin");
  if (tier >= 2) required.add("ninIdentityMatch");

  return [...required].filter((capability) => capabilities[capability] === "UNCONFIGURED");
};

export const getPaystackDedicatedAccountBlockReason = ({
  user,
  profile,
  policy,
  livePaymentsEnabled = isPaystackLivePaymentsEnabled(),
} = {}) => {
  if (!user) return "account_unmatched";
  if (user.isSuspended) return "account_suspended";
  const tier = getCurrentKycTier(profile);
  if (!tier) return "verification_required";
  if (getUnconfiguredPaystackDvaKycCapabilities(tier).length) return "kyc_provider_unconfigured";
  if (!livePaymentsEnabled) return "paystack_disabled";
  if (getPolicyBlockReason(policy, "funding", tier)) return "funding_policy_unconfigured";
  if (policy?.[`tier${tier}`]?.fundingMethods?.includes("paystack_dedicated_account") !== true) {
    return "funding_method_not_approved";
  }
  return null;
};

const getCustomerCode = (data) => {
  const code = data?.customer_code || data?.customer?.customer_code;
  return typeof code === "string" && code.trim() ? code.trim() : null;
};

export const applyPaystackDedicatedAccountEvent = async (event, { UserModel = User } = {}) => {
  const eventType = event?.event;
  const data = event?.data;
  if (![
    "customeridentification.success",
    "customeridentification.failed",
    "dedicatedaccount.assign.success",
    "dedicatedaccount.assign.failed",
  ].includes(eventType)) return { result: "ignored" };

  const customerCode = getCustomerCode(data);
  if (!customerCode) return { result: "unmatched" };
  const user = await UserModel.findOne({ "paystackCustomer.customerCode": customerCode }).select("+paystackCustomer");
  if (!user) return { result: "unmatched" };

  if (eventType === "customeridentification.success") {
    user.paystackCustomer.identificationStatus = "verified";
    user.paystackCustomer.lastErrorCode = null;
  } else if (eventType === "customeridentification.failed") {
    user.paystackCustomer.identificationStatus = "failed";
    user.paystackCustomer.lastErrorCode = "provider_identification_failed";
  } else if (eventType === "dedicatedaccount.assign.failed") {
    user.paystackCustomer.dedicatedAccountStatus = "failed";
    user.paystackCustomer.lastErrorCode = "provider_assignment_failed";
  } else {
    const account = data?.dedicated_account || data;
    const bankName = account?.bank?.name;
    if (
      account?.assigned !== true || account.active !== true ||
      typeof account?.account_number !== "string" || !account.account_number ||
      typeof account?.account_name !== "string" || !account.account_name ||
      typeof bankName !== "string" || !bankName
    ) {
      user.paystackCustomer.dedicatedAccountStatus = "pending";
      user.paystackCustomer.lastErrorCode = "incomplete_assignment_event";
      await user.save();
      return { result: "incomplete" };
    }

    user.paystackCustomer.dedicatedAccountStatus = "active";
    user.paystackCustomer.dedicatedAccountId = Number.isSafeInteger(account.id) ? account.id : null;
    user.paystackCustomer.dedicatedAccountNumber = account.account_number;
    user.paystackCustomer.dedicatedAccountName = account.account_name;
    user.paystackCustomer.dedicatedBankName = bankName;
    user.paystackCustomer.dedicatedBankSlug = typeof account.bank.slug === "string" ? account.bank.slug : null;
    user.paystackCustomer.dedicatedCurrency = ["NGN", "GHS"].includes(account.currency) ? account.currency : null;
    user.paystackCustomer.lastErrorCode = null;
  }

  await user.save();
  return { result: "updated", eventType };
};
