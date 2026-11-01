import express from "express";
import { verifyEmail } from "../controllers/verifyController.js";
import { otpRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/", otpRateLimiter, verifyEmail);

export default router;
