import express from "express";
import {
  beginPasskeyLogin,
  beginPasskeyRegistration,
  beginPasskeyStepUp,
  createPasswordStepUp,
  finishPasskeyLogin,
  finishPasskeyRegistration,
  finishPasskeyStepUp,
  listSecurityDevices,
  revokePasskey,
  revokeSession,
} from "../controllers/securityController.js";
import { protect } from "../middleware/authMiddleware.js";
import { securityRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/passkey/login/options", securityRateLimiter, beginPasskeyLogin);
router.post("/passkey/login/verify", securityRateLimiter, finishPasskeyLogin);
router.post("/passkey/registration/options", protect, securityRateLimiter, beginPasskeyRegistration);
router.post("/passkey/registration/verify", protect, securityRateLimiter, finishPasskeyRegistration);
router.get("/devices", protect, listSecurityDevices);
router.delete("/passkeys/:id", protect, securityRateLimiter, revokePasskey);
router.delete("/sessions/:tokenId", protect, securityRateLimiter, revokeSession);
router.post("/step-up/password", protect, securityRateLimiter, createPasswordStepUp);
router.post("/step-up/passkey/options", protect, securityRateLimiter, beginPasskeyStepUp);
router.post("/step-up/passkey/verify", protect, securityRateLimiter, finishPasskeyStepUp);

export default router;
