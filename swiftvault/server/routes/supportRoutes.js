import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { supportRateLimiter } from "../middleware/rateLimiter.js";
import {
  addCustomerSupportMessage,
  createSupportTicket,
  listMySupportTickets,
} from "../controllers/supportController.js";

const router = express.Router();

router.use(protect);
router.get("/", listMySupportTickets);
router.post("/", supportRateLimiter, createSupportTicket);
router.post("/:ticketId/messages", supportRateLimiter, addCustomerSupportMessage);

export default router;
