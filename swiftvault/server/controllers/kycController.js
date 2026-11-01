import KycAuditLog from "../models/KycAuditLog.js";
import KycAttempt from "../models/KycAttempt.js";
import FundingException from "../models/FundingException.js";
import KycProfile from "../models/KycProfile.js";
import User from "../models/User.js";
import { canApproveTierThree, getCurrentKycTier, getOrCreateKycProfile, KYC_CAPABILITIES, KYC_REQUIREMENTS, KYC_REQUIREMENTS_APPROVED, getTransactionPolicy, TRANSACTION_POLICY_ENFORCEMENT_READY } from "../services/kycPolicyService.js";

const STATUS_LABELS = {
  not_started: "Not started",
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  action_required: "Action required",
};

const toPublicProfile = (profile) => ({
  currentTier: getCurrentKycTier(profile),
  tiers: [1, 2, 3].map((tierNumber) => {
    const tierProfile = profile[`tier${tierNumber}`];
    const status = tierProfile.status === "verified" && getCurrentKycTier(profile) < tierNumber
      ? "action_required"
      : tierProfile.status || "not_started";
    return {
      tier: tierNumber,
      status,
      statusLabel: STATUS_LABELS[status],
      requirements: KYC_REQUIREMENTS[tierNumber].map((requirement) => ({
        ...requirement,
        status: tierProfile[requirement.key] || tierProfile.status || "not_started",
        statusLabel: STATUS_LABELS[tierProfile[requirement.key] || tierProfile.status || "not_started"],
      })),
      reason: tierNumber === 3 ? tierProfile.reviewReason || null : null,
    };
  }),
  capabilities: KYC_CAPABILITIES,
});

const policySummary = (policy) => ({
  configured: Boolean(TRANSACTION_POLICY_ENFORCEMENT_READY && policy?.approved && policy?.enforcementEnabled && policy?.approvalReference && policy?.approvedAt && policy?.approvedBy && policy?.dailyTimeZone),
  dailyTimeZone: policy?.dailyTimeZone || null,
  tiers: [1, 2, 3].map((tier) => {
    const limits = policy?.[`tier${tier}`];
    return {
      tier,
      minimumAmount: limits?.minimumAmount ?? null,
      minimumAmount: limits?.minimumAmount ?? null,
      maximumPerTransaction: limits?.maximumPerTransaction ?? null,
      maximumOutgoingPerDay: limits?.maximumOutgoingPerDay ?? null,
      maximumOutgoingCountPerDay: limits?.maximumOutgoingCountPerDay ?? null,
      maximumWalletBalance: limits?.maximumWalletBalance ?? null,
      maximumFundingPerTransaction: limits?.maximumFundingPerTransaction ?? null,
      maximumFundingPerDay: limits?.maximumFundingPerDay ?? null,
      maximumWithdrawalPerTransaction: limits?.maximumWithdrawalPerTransaction ?? null,
      maximumWithdrawalPerDay: limits?.maximumWithdrawalPerDay ?? null,
      maximumWithdrawalCountPerDay: limits?.maximumWithdrawalCountPerDay ?? null,
      eligibleServices: limits?.eligibleServices || [],
      fundingMethods: limits?.fundingMethods || [],
    };
  }),
});

export const getKycOverview = async (req, res) => {
  try {
    const [profile, policy] = await Promise.all([
      getOrCreateKycProfile(req.user.id),
      getTransactionPolicy(),
    ]);
    return res.json({
      verification: toPublicProfile(profile),
      transactionPolicy: policySummary(policy),
      availableFeatures: {
        walletFunding: false,
        internalTransfers: false,
        bankTransfers: false,
        withdrawals: false,
        services: [],
      },
      blockers: [
        ...(Object.values(KYC_CAPABILITIES).includes("UNCONFIGURED") ? ["An authorized identity and liveness provider is not configured."] : []),
        ...(Object.values(KYC_REQUIREMENTS_APPROVED).some((approved) => !approved) ? ["The applicable verification requirements for each tier have not been approved."] : []),
        ...(!policySummary(policy).configured ? ["Approved tier limits and a daily accounting timezone are not configured."] : []),
      ],
    });
  } catch (error) {
    console.error("KYC overview failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Verification status is temporarily unavailable." });
  }
};

export const startKycTier = async (req, res) => {
  const tier = Number(req.params.tier);
  if (![1, 2, 3].includes(tier)) {
    return res.status(400).json({ message: "Choose a valid verification tier." });
  }
  const capability = tier === 1 ? "BVN and liveness verification" : tier === 2 ? "authorized NIN verification" : "approved enhanced-KYC requirements";
  try {
    await KycAttempt.create({
      userId: req.user.id,
      requestedTier: tier,
      status: "blocked",
      reasonCode: "provider_unconfigured",
    });
    return res.status(503).json({
      code: "VERIFICATION_PROVIDER_UNCONFIGURED",
      message: `${capability} is unavailable because the authorized provider and approved requirements are not configured. No personal identity or biometric data was collected.`,
    });
  } catch (error) {
    console.error("KYC start attempt could not be recorded:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "The verification request could not be recorded. No identity data was collected." });
  }
};

export const listAdminKycProfiles = async (req, res) => {
  try {
    const [users, profiles, attempts, auditEvents, fundingExceptions] = await Promise.all([
      User.find({ role: { $ne: "admin" } }).select("fullName username email isSuspended +paystackCustomer").lean(),
      KycProfile.find().select("userId tier1 tier2 tier3 updatedAt").lean(),
      KycAttempt.find().sort({ createdAt: -1 }).limit(100).populate("userId", "fullName username").lean(),
      KycAuditLog.find().sort({ createdAt: -1 }).limit(100)
        .populate("userId", "fullName username")
        .populate("adminId", "fullName username")
        .lean(),
      FundingException.find({ status: "held" }).sort({ createdAt: 1 }).limit(100)
        .populate("userId", "fullName username")
        .lean(),
    ]);
    const profilesByUser = new Map(profiles.map((profile) => [String(profile.userId), profile]));
    const policy = await getTransactionPolicy();
    return res.json({
      profiles: users.map((user) => {
        const { paystackCustomer, ...publicUser } = user;
        return {
          user: publicUser,
          paystack: {
            customerStatus: paystackCustomer?.customerStatus || "not_started",
            identificationStatus: paystackCustomer?.identificationStatus || "not_started",
            dedicatedAccountStatus: paystackCustomer?.dedicatedAccountStatus || "not_started",
          },
          verification: toPublicProfile(profilesByUser.get(String(user._id)) || {
            tier1: {}, tier2: {}, tier3: {},
          }),
          updatedAt: profilesByUser.get(String(user._id))?.updatedAt || null,
        };
      }),
      attempts: attempts.filter((attempt) => attempt.userId).map((attempt) => ({
        user: attempt.userId,
        requestedTier: attempt.requestedTier,
        status: attempt.status,
        reasonCode: attempt.reasonCode,
        createdAt: attempt.createdAt,
      })),
      auditEvents: auditEvents.filter((event) => event.userId && event.adminId).map((event) => ({
        user: event.userId,
        admin: event.adminId,
        action: event.action,
        reason: event.reason,
        evidenceReference: event.evidenceReference,
        createdAt: event.createdAt,
      })),
      fundingExceptions: fundingExceptions.map((exception) => ({
        paymentReference: exception.paymentReference,
        accountReference: exception.accountReference,
        user: exception.userId,
        amount: exception.amount,
        currency: exception.currency,
        reasonCode: exception.reasonCode,
        createdAt: exception.createdAt,
      })),
      transactionPolicy: policySummary(policy),
      capabilities: KYC_CAPABILITIES,
      tierRequirementsApproved: KYC_REQUIREMENTS_APPROVED,
    });
  } catch (error) {
    console.error("Admin KYC listing failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Verification records are temporarily unavailable." });
  }
};

export const reviewTierThree = async (req, res) => {
  const { decision, reason, evidenceReference } = req.body;
  const cleanReason = String(reason || "").trim();
  const cleanEvidenceReference = String(evidenceReference || "").trim();
  const containsSensitivePattern = (value) =>
    /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/.test(value) ||
    /\d(?:[\s-]*\d){9,}/.test(value);
  if (
    !["verified", "rejected", "action_required"].includes(decision) ||
    !cleanReason ||
    !cleanEvidenceReference ||
    containsSensitivePattern(cleanReason) ||
    containsSensitivePattern(cleanEvidenceReference)
  ) {
    return res.status(400).json({ message: "A valid decision, reason, and non-sensitive evidence reference are required." });
  }

  try {
    const profile = await KycProfile.findOne({ userId: req.params.userId });
    if (!profile) return res.status(404).json({ message: "Verification profile not found." });
    if (profile.tier3.status !== "pending") {
      return res.status(409).json({ message: "Only a pending Tier 3 manual review can be decided." });
    }
    if (decision === "verified") {
      if (!canApproveTierThree(profile)) {
        return res.status(409).json({ message: "Tier 3 cannot be approved until Tier 1, Tier 2, and all approved Tier 3 checks are verified by their authorized sources." });
      }
    }

    const action = decision === "verified" ? "tier3_approved" : decision === "rejected" ? "tier3_rejected" : "tier3_action_required";
    const session = await KycProfile.startSession();
    try {
      session.startTransaction();
      profile.tier3.status = decision;
      profile.tier3.manualReview = decision;
      profile.tier3.reviewReason = String(reason).trim().slice(0, 500);
      profile.tier3.reviewedBy = req.user.id;
      profile.tier3.reviewedAt = new Date();
      await profile.save({ session });
      await KycAuditLog.create([{
        userId: profile.userId,
        adminId: req.user.id,
        action,
        reason: profile.tier3.reviewReason,
        evidenceReference: cleanEvidenceReference.slice(0, 200),
      }], { session });
      await session.commitTransaction();
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }

    return res.json({ success: true, tier3Status: profile.tier3.status, reviewedAt: profile.tier3.reviewedAt });
  } catch (error) {
    console.error("Tier 3 review failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "The review and audit record could not be saved." });
  }
};
