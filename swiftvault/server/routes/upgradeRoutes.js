import express from "express";
import { getUpgradeFee, purchaseUpgrade } from "../controllers/upgradeController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requirePurchaseIdempotency } from "../middleware/purchaseIdempotency.js";
import { requireTransactionPolicy } from "../middleware/requireTransactionPolicy.js";
import { requireOutgoingSecurityCooldownCleared, requireStepUp } from "../middleware/securityGuards.js";
import { financialMutationRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.get("/fee", protect, getUpgradeFee);
router.post("/purchase", protect, financialMutationRateLimiter, requireTransactionPolicy("membership"), requireOutgoingSecurityCooldownCleared, requireStepUp("membership_purchase"), requirePurchaseIdempotency("upgrade"), purchaseUpgrade);

export default router;
