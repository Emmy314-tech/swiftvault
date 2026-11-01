import express from "express";
import {
  getBusinessSettings,
  updatePricing,
  updateUpgradeFees,
  updateTransferFees,
  updateTransactionPolicyLimits,
  updateServiceToggles,
  createBankAccount,
  editBankAccount,
  deleteBankAccount,
  listActiveBankAccounts,
  updateApiCredential,
  getPublicSystemSettings,
  updateSystemSettings,
} from "../controllers/settingsController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/admin.js";
import { requireAdminPin } from "../middleware/requireAdminPin.js";
import { financialMutationRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Public/user-facing - safe, non-sensitive data only
router.get("/bank-accounts/active", protect, listActiveBankAccounts);
router.get("/system/public", getPublicSystemSettings);

// Everything below is Super Admin only
router.use(protect, adminOnly);

router.get("/", getBusinessSettings);
router.patch("/pricing", financialMutationRateLimiter, requireAdminPin, updatePricing);
router.patch("/upgrade-fees", financialMutationRateLimiter, requireAdminPin, updateUpgradeFees);
router.patch("/transfer-fees", financialMutationRateLimiter, requireAdminPin, updateTransferFees);
router.patch("/transaction-policy/limits", financialMutationRateLimiter, requireAdminPin, updateTransactionPolicyLimits);
router.patch("/services", financialMutationRateLimiter, requireAdminPin, updateServiceToggles);
router.patch("/system", financialMutationRateLimiter, requireAdminPin, updateSystemSettings);

router.post("/bank-accounts", financialMutationRateLimiter, requireAdminPin, createBankAccount);
router.patch("/bank-accounts/:id", financialMutationRateLimiter, requireAdminPin, editBankAccount);
router.delete("/bank-accounts/:id", financialMutationRateLimiter, requireAdminPin, deleteBankAccount);

router.patch("/credentials", financialMutationRateLimiter, requireAdminPin, updateApiCredential);

export default router;
