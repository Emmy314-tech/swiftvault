import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireServiceEnabled } from "../middleware/serviceToggle.js";
import { requireTransactionPolicy } from "../middleware/requireTransactionPolicy.js";
import { getPaystackFundingStatus, initializePaystackFunding, verifyPaystackFunding } from "../controllers/paystackFundingController.js";
import { assignPaystackDedicatedAccount, getPaystackDedicatedAccountStatus } from "../controllers/paystackDedicatedAccountController.js";
import { requireStepUp } from "../middleware/securityGuards.js";
import { walletFundingRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.get("/paystack/status", protect, getPaystackFundingStatus);
router.get("/paystack/dedicated-account", protect, getPaystackDedicatedAccountStatus);
router.post("/paystack/dedicated-account/assign", protect, walletFundingRateLimiter, requireServiceEnabled("walletFunding"), requireTransactionPolicy("funding", null, "paystack_dedicated_account"), requireStepUp("wallet_funding"), assignPaystackDedicatedAccount);
router.post("/paystack/initialize", protect, walletFundingRateLimiter, requireServiceEnabled("walletFunding"), requireTransactionPolicy("funding", null, "paystack"), requireStepUp("wallet_funding"), initializePaystackFunding);
router.post("/paystack/verify", protect, walletFundingRateLimiter, verifyPaystackFunding);
export default router;
