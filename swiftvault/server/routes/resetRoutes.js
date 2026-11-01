import express from "express";
import { requestReset, resetPassword } from "../controllers/resetController.js";
import { otpRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Both endpoints deal with 6-digit recovery codes - rate-limited so the codes
// can't be brute-forced (this is a full account-takeover path).
router.post("/request", otpRateLimiter, requestReset);
router.post("/reset", otpRateLimiter, resetPassword);

export default router;
