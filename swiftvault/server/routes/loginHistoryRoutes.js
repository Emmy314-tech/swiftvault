import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getLoginHistory } from "../controllers/loginHistoryController.js";

const router = express.Router();

router.get("/", protect, getLoginHistory);

export default router;
