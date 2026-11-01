import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireServiceEnabled } from "../middleware/serviceToggle.js";
import { requirePurchaseIdempotency } from "../middleware/purchaseIdempotency.js";
import { lookupRecipient, sendMoney, getBeneficiaries, deleteBeneficiary } from "../controllers/transferController.js";
import { requireTransactionPolicy } from "../middleware/requireTransactionPolicy.js";
import { requireOutgoingSecurityCooldownCleared, requireStepUp } from "../middleware/securityGuards.js";
import { financialMutationRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// P2P Internal Transfer Endpoints
router.get("/lookup/:phone", protect, financialMutationRateLimiter, lookupRecipient);
router.post("/send", protect, financialMutationRateLimiter, requireServiceEnabled("walletTransfer"), requireTransactionPolicy("transfer"), requireOutgoingSecurityCooldownCleared, requireStepUp("transfer"), requirePurchaseIdempotency("wallet_transfer"), sendMoney);

// Beneficiary management
router.get("/beneficiaries", protect, getBeneficiaries);
router.delete("/beneficiaries/:id", protect, financialMutationRateLimiter, requireStepUp("beneficiary_change"), deleteBeneficiary);

export default router;
