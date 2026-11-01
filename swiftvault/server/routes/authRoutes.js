import express from "express";
import { register, login, verifyPhoneOTP, resendOtp, logout } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { loginRateLimiter, registerRateLimiter, otpRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Core Authentication Endpoints
router.post("/register", registerRateLimiter, register);
router.post("/login", loginRateLimiter, login);

// Secure Phone OTP Verification (rate-limited - 6-digit codes must not be brute-forceable)
router.post("/verify-otp", otpRateLimiter, verifyPhoneOTP);
router.post("/resend-otp", otpRateLimiter, resendOtp);
router.post("/logout", protect, logout);

export default router;
