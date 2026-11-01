import TierPolicy from "../models/TierPolicy.js";
import KycProfile from "../models/KycProfile.js";
import User from "../models/User.js";
import { getCurrentKycTier, getPolicyBlockReason } from "../services/kycPolicyService.js";

const ACTION_LABELS = {
  transfer: "outgoing transfers",
  service: "wallet-funded services",
  funding: "wallet funding",
  withdrawal: "withdrawals",
  membership: "membership purchases",
};

export const requireTransactionPolicy = (action, serviceName = null, fundingMethod = "paystack") => async (req, res, next) => {
  try {
    const policy = await TierPolicy.findOne({ key: "customer_transaction_policy" }).lean();
    const policyError = getPolicyBlockReason(policy, action);
    if (policyError) {
      return res.status(503).json({
        success: false,
        code: "TRANSACTION_POLICY_UNCONFIGURED",
        message: `${ACTION_LABELS[action] || "This transaction"} are unavailable: ${policyError}`,
      });
    }

    const user = await User.findById(req.user.id).select("walletBalance isSuspended");
    if (!user || user.isSuspended) {
      return res.status(403).json({ success: false, code: "ACCOUNT_INELIGIBLE", message: "This account is not eligible for transactions." });
    }

    const profile = await KycProfile.findOne({ userId: user._id }).lean();
    const tier = getCurrentKycTier(profile);
    if (!tier) {
      return res.status(403).json({
        success: false,
        code: "VERIFICATION_REQUIRED",
        message: "Complete the required identity verification before using this transaction feature.",
      });
    }

    const tierPolicyError = getPolicyBlockReason(policy, action, tier);
    if (tierPolicyError) {
      return res.status(503).json({
        success: false,
        code: "TRANSACTION_POLICY_UNCONFIGURED",
        message: `${ACTION_LABELS[action] || "This transaction"} are unavailable: ${tierPolicyError}`,
      });
    }

    const tierPolicy = policy[`tier${tier}`];
    if (!tierPolicy) {
      return res.status(503).json({ success: false, code: "TIER_POLICY_UNCONFIGURED", message: "A transaction policy for your verified tier is not configured." });
    }

    const service = action === "service" ? serviceName : null;
    if (service && !tierPolicy.eligibleServices?.includes(service)) {
      return res.status(403).json({ success: false, code: "SERVICE_NOT_APPROVED", message: "This service is not approved for your verified tier." });
    }
    if (action === "funding" && !tierPolicy.fundingMethods?.includes(fundingMethod)) {
      return res.status(403).json({ success: false, code: "FUNDING_METHOD_NOT_APPROVED", message: "This funding method is not approved for your verified tier." });
    }

    req.transactionPolicy = { policy, tierPolicy, tier, action };
    return next();
  } catch (error) {
    console.error("Transaction policy check failed:", error.code || error.name || "unclassified_error");
    return res.status(503).json({
      success: false,
      code: "TRANSACTION_POLICY_UNAVAILABLE",
      message: "Transaction policy could not be verified. Please try again later.",
    });
  }
};
