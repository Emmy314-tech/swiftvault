import express from "express";
import { getKycOverview, startKycTier } from "../controllers/kycController.js";
import { protect } from "../middleware/authMiddleware.js";
import { kycRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.get("/", protect, getKycOverview);
router.post("/tiers/:tier/start", protect, kycRateLimiter, startKycTier);

export default router;
