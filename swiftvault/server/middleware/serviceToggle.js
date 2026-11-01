import { isServiceEnabled } from "../services/settingsService.js";

// Usage: router.post("/purchase", protect, requireServiceEnabled("data"), purchaseData)
// Blocks the request with a clear maintenance message if an admin has disabled
// this service in the Business Control Center, without touching any other behavior.
export function requireServiceEnabled(serviceName) {
  return async (req, res, next) => {
    try {
      const enabled = await isServiceEnabled(serviceName);
      if (!enabled) {
        return res.status(503).json({
          message: `This service is temporarily unavailable for maintenance. Please try again later.`,
        });
      }
      next();
    } catch (err) {
      // Fail open on unexpected errors so a Settings lookup issue doesn't take down the whole platform
      console.error("Service-enabled check failed, allowing request through:", err.message);
      next();
    }
  };
}
