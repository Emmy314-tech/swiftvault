import express from "express";
import { 
  getWallet, 
  getDashboard, 
  getProfile, 
  updateProfile,
  claimWelcomeBonus,
} from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js"; // Ensures the student is logged in
import { financialMutationRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Core Banking User Ledger Routing Matrix
router.get("/wallet", protect, getWallet);
router.get("/dashboard", protect, getDashboard);
router.get("/profile", protect, getProfile);
router.put("/update", protect, updateProfile);
router.post("/welcome-bonus/claim", protect, financialMutationRateLimiter, claimWelcomeBonus);

export default router;
