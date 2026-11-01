import {
  KYC_CAPABILITIES,
  KYC_REQUIREMENTS_APPROVED,
  TRANSACTION_POLICY_ENFORCEMENT_READY,
} from "./kycPolicyService.js";
import { isPaystackLivePaymentsEnabled } from "./paystackGateway.js";

const check = (status, details = [], action = null) => ({ status, details, action });

const getPolicyApprovalIssues = (policy) => {
  const issues = [];
  if (!policy) return ["Transaction policy record is missing."];
  if (policy.approved !== true) issues.push("Transaction policy approval is not recorded.");
  if (policy.enforcementEnabled !== true) issues.push("Transaction policy enforcement is disabled.");
  if (!policy.approvalReference) issues.push("Policy approval reference is missing.");
  if (!policy.approvedAt) issues.push("Policy approval date is missing.");
  if (!policy.approvedBy) issues.push("Policy approver is missing.");
  if (!policy.dailyTimeZone) issues.push("Approved daily accounting timezone is missing.");
  return issues;
};

const getTierFundingIssues = (policy) => {
  const requiredFields = [
    "maximumFundingPerTransaction",
    "maximumFundingPerDay",
    "maximumWalletBalance",
  ];
  const issues = [];

  for (const tierNumber of [1, 2, 3]) {
    const tier = policy?.[`tier${tierNumber}`];
    if (!tier) {
      issues.push(`Tier ${tierNumber}: funding limits are missing.`);
      continue;
    }
    for (const field of requiredFields) {
      if (!Number.isFinite(tier[field]) || tier[field] < 0) {
        issues.push(`Tier ${tierNumber}: ${field} is not configured.`);
      }
    }
    if (tier.fundingMethods?.includes("paystack_dedicated_account") !== true) {
      issues.push(`Tier ${tierNumber}: paystack_dedicated_account is not an approved funding method.`);
    }
  }
  return issues;
};

const getMinimumAmountDetails = (policy) => [1, 2, 3].map((tierNumber) => {
  const minimum = policy?.[`tier${tierNumber}`]?.minimumAmount;
  return Number.isFinite(minimum) && minimum >= 0
    ? `Tier ${tierNumber}: minimum funding amount is ${minimum}.`
    : `Tier ${tierNumber}: no minimum funding amount is configured.`;
});

const getKycProviderIssues = () => {
  const capabilityLabels = {
    bvn: "BVN verification provider",
    bvnDateOfBirthMatch: "BVN date-of-birth matching provider",
    bvnNameMatch: "BVN name matching provider",
    nin: "NIN verification provider",
    ninIdentityMatch: "NIN identity matching provider",
    faceLiveness: "Face/liveness provider",
  };
  const issues = Object.entries(capabilityLabels)
    .filter(([capability]) => KYC_CAPABILITIES[capability] === "UNCONFIGURED")
    .map(([, label]) => `${label} is not configured.`);

  return issues;
};

const getKycApprovalIssues = () => {
  const issues = [];
  if (KYC_REQUIREMENTS_APPROVED.tier1 !== true) issues.push("Tier 1 verification requirements are not approved.");
  if (typeof KYC_REQUIREMENTS_APPROVED.tier1BvnNameMatchRequired !== "boolean") {
    issues.push("Tier 1 BVN name-match requirement has not been approved.");
  }
  if (typeof KYC_REQUIREMENTS_APPROVED.tier1NinConsistencyRequired !== "boolean") {
    issues.push("Tier 1 NIN-consistency requirement has not been approved.");
  }
  if (KYC_REQUIREMENTS_APPROVED.tier2 !== true) issues.push("Tier 2 verification requirements are not approved.");
  if (KYC_REQUIREMENTS_APPROVED.tier3 !== true) issues.push("Tier 3 verification requirements are not approved.");
  if (typeof KYC_REQUIREMENTS_APPROVED.tier3AddressRequired !== "boolean") {
    issues.push("Tier 3 address requirement has not been approved.");
  }
  if (typeof KYC_REQUIREMENTS_APPROVED.tier3SupportingDocumentsRequired !== "boolean") {
    issues.push("Tier 3 supporting-document requirement has not been approved.");
  }
  return issues;
};

export const buildPaystackDvaReadiness = ({
  credentials = {},
  policy = null,
  env = process.env,
} = {}) => {
  const paystackCredentialConfigured = credentials.paystackSecretKey?.configured === true;
  const credentialMode = credentials.paystackSecretKey?.mode || "unknown";
  const credentialDetails = !paystackCredentialConfigured
    ? ["Paystack Secret Key is not configured in Admin API Credentials or the server environment."]
    : credentialMode === "unknown"
      ? ["Paystack credential is configured, but its key mode cannot be safely classified."]
      : [`A ${credentialMode} Paystack credential is configured; its value is not exposed.`];
  const credentialStatus = !paystackCredentialConfigured || credentialMode === "unknown"
    ? "blocked"
    : "configured";
  const kycProviderIssues = getKycProviderIssues();
  const kycApprovalIssues = getKycApprovalIssues();
  const policyIssues = getPolicyApprovalIssues(policy);
  const fundingIssues = getTierFundingIssues(policy);
  const identificationIssues = [
    "An authorized BVN/bank-account identification input or provider flow is not configured.",
    "Paystack identification requires bank account number, BVN, bank code, and customer name; these values are not collected by the existing KYC profile.",
  ];
  const bankConfigured = Boolean(env.PAYSTACK_DVA_PREFERRED_BANK?.trim());
  const livePaymentsEnabled = isPaystackLivePaymentsEnabled(env);

  const checks = [
    {
      key: "credentials",
      label: "Paystack credentials",
      ...check(credentialStatus, credentialDetails,
        credentialStatus === "blocked" ? "Configure a Paystack credential and verify its test/live mode in Admin API Credentials." : null),
    },
    {
      key: "customerIntegration",
      label: "Paystack customer integration",
      ...check(paystackCredentialConfigured ? "unverified" : "blocked",
        paystackCredentialConfigured
          ? ["Customer lookup and creation code is integrated. Paystack API connectivity has not been probed."]
          : credentialDetails,
        paystackCredentialConfigured ? "Run a controlled test-key diagnostic after the database-first credential resolver is available; this readiness view makes no provider call." : "Configure the Paystack secret in API Credentials."),
    },
    {
      key: "kycProviders",
      label: "KYC provider configuration",
      ...check(kycProviderIssues.length ? "blocked" : "ready", kycProviderIssues,
        kycProviderIssues.length ? "Configure authorized existing KYC providers without changing tier requirements." : null),
    },
    {
      key: "kycPolicyApproval",
      label: "KYC policy approval",
      ...check(kycApprovalIssues.length ? "blocked" : "ready", kycApprovalIssues,
        kycApprovalIssues.length ? "Complete approvals through the existing KYC/compliance process; this page does not approve requirements." : null),
    },
    {
      key: "transactionPolicy",
      label: "Transaction policy approval",
      ...check(policyIssues.length ? "blocked" : "ready", policyIssues,
        policyIssues.length ? "Configure and approve the existing transaction policy through its authorized governance process." : null),
    },
    {
      key: "tierFundingLimits",
      label: "Tier funding limits",
      ...check(fundingIssues.length ? "blocked" : "ready", fundingIssues,
        fundingIssues.length ? "Have authorized administrators configure and approve existing tier funding limits; no limits are suggested here." : null),
    },
    {
      key: "minimumFundingAmounts",
      label: "Existing minimum funding amounts",
      ...check("informational", getMinimumAmountDetails(policy),
        "No minimum values are inferred or added; configure them only through the approved tier-policy process if required."),
    },
    {
      key: "dailyFundingEnforcement",
      label: "Daily funding enforcement",
      ...check(TRANSACTION_POLICY_ENFORCEMENT_READY ? "ready" : "blocked",
        TRANSACTION_POLICY_ENFORCEMENT_READY
          ? []
          : ["Atomic daily transaction reservations are not enabled."],
        TRANSACTION_POLICY_ENFORCEMENT_READY
          ? null
          : "Implement and validate atomic daily reservations before approving real-money funding."),
    },
    {
      key: "preferredBank",
      label: "Preferred DVA bank",
      ...check(bankConfigured ? "ready" : "blocked",
        bankConfigured ? [] : ["PAYSTACK_DVA_PREFERRED_BANK is not configured."],
        bankConfigured ? null : "Configure an eligible preferred bank supported by the Paystack account; do not guess a bank identifier."),
    },
    {
      key: "identification",
      label: "Paystack identification readiness",
      ...check("blocked", identificationIssues,
        "Connect Paystack identification only to an authorized, consented source for the required bank-account/BVN fields; do not substitute it for NIN or face verification."),
    },
    {
      key: "livePayments",
      label: "Live payment mode",
      ...check(livePaymentsEnabled ? "ready" : "blocked",
        livePaymentsEnabled ? [] : ["Live Paystack payments are disabled; this is an intentional safety hold."],
        livePaymentsEnabled ? null : "Keep disabled during implementation and controlled testing. Production enablement requires separate authorization."),
    },
  ];

  const blockers = checks.filter(({ status }) => ["blocked", "unverified"].includes(status));
  return {
    status: blockers.length ? "blocked" : "ready",
    eligible: blockers.length === 0,
    checks,
    blockers: blockers.map(({ key, label, details }) => ({ key, label, details })),
  };
};
