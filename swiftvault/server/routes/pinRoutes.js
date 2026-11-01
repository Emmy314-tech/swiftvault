import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { setPin, setAdminPin } from "../controllers/pinController.js";
import { requireStepUp } from "../middleware/securityGuards.js";

const router = express.Router();

router.post("/set", protect, requireStepUp("pin_change"), setPin);
router.post("/set-admin-pin", protect, requireStepUp("admin_pin_change"), setAdminPin);

export default router;
