import User from "../models/User.js";
import { authenticateAdminPin } from "../services/pinService.js";

// Applied after `protect` + `adminOnly` on any route that performs a high-risk
// admin action (company withdrawal, wallet adjustment, credential/pricing/settings
// changes, user suspension). Expects `adminPin` in the request body.
export const requireAdminPin = async (req, res, next) => {
  try {
    const { adminPin } = req.body;

    if (!adminPin) {
      return res.status(400).json({ message: "Admin PIN is required for this action" });
    }

    const admin = await User.findById(req.user.id);

    const authentication = await authenticateAdminPin(admin, adminPin);
    if (!authentication.ok) {
      return res.status(authentication.status).json({ message: authentication.message });
    }

    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
