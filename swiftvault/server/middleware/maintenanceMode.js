import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { getSettings } from "../services/settingsService.js";

// Applied globally, BEFORE any route-specific `protect` middleware runs - so it
// can't rely on req.user being populated yet. Does its own best-effort,
// non-fatal token peek (same decode as authMiddleware.js's `protect`) purely to
// check for an admin bypass; it does not enforce authentication itself and
// never blocks a request just because a token is missing/invalid - that's still
// `protect`'s job for whichever routes actually require it.
async function peekIsAdmin(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer")) return false;
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("role");
    return user?.role === "admin";
  } catch {
    return false;
  }
}

export const enforceMaintenanceMode = async (req, res, next) => {
  try {
    const settings = await getSettings();

    if (!settings.system.maintenanceMode) {
      return next();
    }

    if (await peekIsAdmin(req)) {
      return next();
    }

    // Allow login so admins can still authenticate during maintenance, and the
    // public system-settings endpoint so the frontend can render the maintenance
    // page with correct branding.
    const ALWAYS_ALLOWED_PATHS = ["/api/auth/login", "/api/settings/system/public"];
    if (ALWAYS_ALLOWED_PATHS.includes(req.path)) {
      return next();
    }

    return res.status(503).json({
      message: "SwiftVault is currently undergoing scheduled maintenance. Please check back shortly.",
      maintenanceMode: true,
    });
  } catch (err) {
    // If the maintenance check itself fails, fail open rather than lock everyone out
    console.error("Maintenance mode check failed, allowing request through:", err.message);
    next();
  }
};
