import StepUpGrant from "../models/StepUpGrant.js";
import { hashRequestContext, hashSecret } from "../services/securityService.js";

export const requireOutgoingSecurityCooldownCleared = (req, res, next) => {
  const cooldownUntil = req.user?.securityCooldownUntil;
  if (cooldownUntil && cooldownUntil > new Date()) {
    return res.status(403).json({
      success: false,
      code: "SECURITY_COOLDOWN_ACTIVE",
      cooldownUntil,
      message: "Outgoing transactions are temporarily restricted after account recovery or a new login context.",
    });
  }
  return next();
};

export const requireStepUp = (action) => async (req, res, next) => {
  try {
    const rawToken = req.get("X-Step-Up-Token");
    if (!rawToken || rawToken.length > 200) {
      return res.status(403).json({ success: false, code: "STEP_UP_REQUIRED", message: "Verify this action with your password or passkey and retry." });
    }

    const grant = await StepUpGrant.findOneAndUpdate({
      tokenHash: hashSecret(rawToken),
      userId: req.user._id,
      sessionTokenId: req.authSession.tokenId,
      action,
      contextHash: hashRequestContext({ body: req.body || {}, params: req.params || {} }),
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    }, { $set: { consumedAt: new Date() } }, { new: true });

    if (!grant) {
      return res.status(403).json({ success: false, code: "STEP_UP_INVALID", message: "This verification is expired, already used, or does not match this action." });
    }
    return next();
  } catch (error) {
    console.error("Step-up verification failed:", error.code || error.name || "unclassified_error");
    return res.status(503).json({ success: false, code: "STEP_UP_UNAVAILABLE", message: "Action authorization could not be verified." });
  }
};
