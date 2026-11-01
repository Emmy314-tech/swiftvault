import User from "../models/User.js";
import KycProfile from "../models/KycProfile.js";
import TierPolicy from "../models/TierPolicy.js";
import { getCredential } from "../services/settingsService.js";
import { createPaystackGateway } from "../services/paystackGateway.js";
import { getPaystackDedicatedAccountBlockReason } from "../services/paystackDedicatedAccountService.js";

const gateway = createPaystackGateway({ getSecretKey: () => getCredential("paystackSecretKey") });

const splitName = (fullName = "") => {
  const [firstName, ...lastParts] = String(fullName).trim().split(/\s+/).filter(Boolean);
  return { firstName, lastName: lastParts.join(" ") };
};

const publicStatus = (user, canAssign, blockReason = null) => ({
  customerStatus: user.paystackCustomer?.customerStatus || "not_started",
  identificationStatus: user.paystackCustomer?.identificationStatus || "not_started",
  accountStatus: user.paystackCustomer?.dedicatedAccountStatus || "not_started",
  account: user.paystackCustomer?.dedicatedAccountStatus === "active" ? {
    bankName: user.paystackCustomer.dedicatedBankName,
    accountName: user.paystackCustomer.dedicatedAccountName,
    accountNumber: user.paystackCustomer.dedicatedAccountNumber,
    currency: user.paystackCustomer.dedicatedCurrency,
  } : null,
  canAssign,
  blockReason,
});

export const createPaystackDedicatedAccountController = ({
  UserModel = User,
  KycProfileModel = KycProfile,
  TierPolicyModel = TierPolicy,
  gatewayClient = gateway,
  getBlockReason = getPaystackDedicatedAccountBlockReason,
  env = process.env,
} = {}) => {
  const getStatus = async (req, res) => {
    try {
      const [user, profile, policy] = await Promise.all([
        UserModel.findById(req.user.id).select("+paystackCustomer"),
        KycProfileModel.findOne({ userId: req.user.id }).lean(),
        TierPolicyModel.findOne({ key: "customer_transaction_policy" }).lean(),
      ]);
      if (!user) return res.status(404).json({ success: false, message: "User not found." });
      const blockReason = getBlockReason({ user, profile, policy });
      return res.json({ success: true, ...publicStatus(user, !blockReason, blockReason) });
    } catch (error) {
      console.error("Paystack DVA status failed:", error.code || error.name || "unclassified_error");
      return res.status(503).json({ success: false, message: "Paystack account status is unavailable." });
    }
  };

  const assign = async (req, res) => {
    if (req.body?.consent !== true) {
      return res.status(400).json({ success: false, code: "CUSTOMER_CONSENT_REQUIRED", message: "Consent is required before sharing customer details with Paystack." });
    }

    try {
      let [user, profile, policy] = await Promise.all([
        UserModel.findById(req.user.id).select("+paystackCustomer"),
        KycProfileModel.findOne({ userId: req.user.id }).lean(),
        TierPolicyModel.findOne({ key: "customer_transaction_policy" }).lean(),
      ]);
      if (!user) return res.status(404).json({ success: false, message: "User not found." });
      const blockReason = getBlockReason({ user, profile, policy });
      if (blockReason) {
        return res.status(503).json({ success: false, code: "PAYSTACK_DVA_UNAVAILABLE", blockReason, message: "Dedicated account assignment is unavailable under the current verified-tier policy." });
      }
      if (user.paystackCustomer?.dedicatedAccountStatus === "active") {
        return res.json({ success: true, ...publicStatus(user, false) });
      }
      if (user.paystackCustomer?.dedicatedAccountStatus === "pending") {
        return res.status(202).json({ success: true, ...publicStatus(user, false) });
      }
      if (user.isSuspended) {
        return res.status(403).json({ success: false, code: "ACCOUNT_INELIGIBLE", message: "This account is not eligible." });
      }

      const { firstName, lastName } = splitName(user.fullName);
      if (!user.email || !user.phone || !firstName || !lastName) {
        return res.status(400).json({ success: false, code: "CUSTOMER_DETAILS_INCOMPLETE", message: "A verified name, email, and phone number are required." });
      }

      user.paystackCustomer = user.paystackCustomer || {};
      if (!user.paystackCustomer.customerCode) {
        const consentedAt = new Date();
        const claim = await UserModel.findOneAndUpdate({
          _id: user._id,
          "paystackCustomer.customerCode": { $in: [null, ""] },
          "paystackCustomer.customerStatus": { $in: ["not_started", "failed"] },
        }, {
          $set: {
            "paystackCustomer.customerStatus": "pending",
            "paystackCustomer.consentedAt": consentedAt,
          },
        }, { new: true }).select("+paystackCustomer");
        if (!claim) {
          const current = await UserModel.findById(user._id).select("+paystackCustomer");
          return res.status(202).json({ success: true, ...publicStatus(current || user, false) });
        }
        user = claim;
        try {
          const customer = await gatewayClient.fetchCustomer(user.email) || await gatewayClient.createCustomer({
            email: user.email, firstName, lastName, phone: user.phone,
          });
          user.paystackCustomer.customerCode = customer.customerCode;
          user.paystackCustomer.customerStatus = "created";
          user.paystackCustomer.lastErrorCode = null;
          await user.save();
          if (customer.dedicatedAccount) {
            user.paystackCustomer.dedicatedAccountStatus = "active";
            user.paystackCustomer.dedicatedAccountId = customer.dedicatedAccount.id;
            user.paystackCustomer.dedicatedAccountNumber = customer.dedicatedAccount.accountNumber;
            user.paystackCustomer.dedicatedAccountName = customer.dedicatedAccount.accountName;
            user.paystackCustomer.dedicatedBankName = customer.dedicatedAccount.bankName;
            user.paystackCustomer.dedicatedBankSlug = customer.dedicatedAccount.bankSlug;
            user.paystackCustomer.dedicatedCurrency = customer.dedicatedAccount.currency;
            await user.save();
            return res.json({ success: true, ...publicStatus(user, false) });
          }
        } catch (error) {
          user.paystackCustomer.customerStatus = "failed";
          user.paystackCustomer.lastErrorCode = error.code || "customer_creation_failed";
          await user.save();
          throw error;
        }
      }

      if (user.paystackCustomer.identificationStatus !== "verified") {
        return res.status(409).json({
          success: false,
          code: "PAYSTACK_IDENTIFICATION_REQUIRED",
          message: "Paystack customer identification must complete before a dedicated account can be assigned. SwiftVault's authorized identity-provider integration is not configured, so no BVN or bank details were collected.",
        });
      }

      if (user.paystackCustomer.dedicatedAccountStatus === "pending") {
        return res.status(202).json({ success: true, ...publicStatus(user, false) });
      }
      const preferredBank = env.PAYSTACK_DVA_PREFERRED_BANK || (env.NODE_ENV === "test" ? "test-bank" : null);
      if (!preferredBank) {
        return res.status(503).json({ success: false, code: "PAYSTACK_DVA_BANK_UNCONFIGURED", message: "A Paystack dedicated-account provider has not been configured." });
      }

      const existingCustomer = await gatewayClient.fetchCustomer(user.paystackCustomer.customerCode);
      if (existingCustomer?.dedicatedAccount) {
        user.paystackCustomer.dedicatedAccountStatus = "active";
        user.paystackCustomer.dedicatedAccountId = existingCustomer.dedicatedAccount.id;
        user.paystackCustomer.dedicatedAccountNumber = existingCustomer.dedicatedAccount.accountNumber;
        user.paystackCustomer.dedicatedAccountName = existingCustomer.dedicatedAccount.accountName;
        user.paystackCustomer.dedicatedBankName = existingCustomer.dedicatedAccount.bankName;
        user.paystackCustomer.dedicatedBankSlug = existingCustomer.dedicatedAccount.bankSlug;
        user.paystackCustomer.dedicatedCurrency = existingCustomer.dedicatedAccount.currency;
        await user.save();
        return res.json({ success: true, ...publicStatus(user, false) });
      }

      const assignmentClaim = await UserModel.findOneAndUpdate({
        _id: user._id,
        "paystackCustomer.dedicatedAccountStatus": { $in: ["not_started", "failed"] },
      }, {
        $set: {
          "paystackCustomer.dedicatedAccountStatus": "pending",
          "paystackCustomer.consentedAt": new Date(),
          "paystackCustomer.lastErrorCode": null,
        },
      }, { new: true }).select("+paystackCustomer");
      if (!assignmentClaim) {
        const current = await UserModel.findById(user._id).select("+paystackCustomer");
        return res.status(202).json({ success: true, ...publicStatus(current || user, false) });
      }
      user = assignmentClaim;

      const account = await gatewayClient.assignDedicatedAccount({
        customerCode: user.paystackCustomer.customerCode,
        preferredBank,
      });
      if (account.status === "pending") {
        return res.status(202).json({ success: true, ...publicStatus(user, false) });
      }
      user.paystackCustomer.dedicatedAccountStatus = "active";
      user.paystackCustomer.dedicatedAccountId = account.id;
      user.paystackCustomer.dedicatedAccountNumber = account.accountNumber;
      user.paystackCustomer.dedicatedAccountName = account.accountName;
      user.paystackCustomer.dedicatedBankName = account.bankName;
      user.paystackCustomer.dedicatedBankSlug = account.bankSlug;
      user.paystackCustomer.dedicatedCurrency = account.currency;
      await user.save();
      return res.json({ success: true, ...publicStatus(user, false) });
    } catch (error) {
      console.error("Paystack DVA assignment failed:", error.code || error.name || "provider_error");
      return res.status(502).json({ success: false, message: "Dedicated account assignment could not be completed." });
    }
  };

  return { getStatus, assign };
};

const controller = createPaystackDedicatedAccountController();
export const getPaystackDedicatedAccountStatus = controller.getStatus;
export const assignPaystackDedicatedAccount = controller.assign;
