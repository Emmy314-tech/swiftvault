import express from "express";
import { protect } from "../middleware/authMiddleware.js";

import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/", protect, getNotifications);

router.patch("/read-all", protect, markAllAsRead);

router.patch("/:id/read", protect, markAsRead);

router.delete("/:id", protect, deleteNotification);

router.delete("/", protect, clearNotifications);

export default router;
