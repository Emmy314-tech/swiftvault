import mongoose from "mongoose";
import SupportTicket from "../models/SupportTicket.js";

const TICKET_CATEGORIES = new Set([
  "account", "transaction", "payment", "service", "security", "complaint", "other",
]);
const TICKET_STATUSES = new Set(["open", "in_review", "resolved", "closed"]);

const validMessage = (value) =>
  typeof value === "string" && value.trim().length >= 5 && value.trim().length <= 4000;

const validateTicketId = (id, res) => {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: "Invalid support ticket reference." });
    return false;
  }
  return true;
};

export const createSupportTicket = async (req, res) => {
  try {
    const { category, subject, reference, message } = req.body ?? {};
    if (!TICKET_CATEGORIES.has(category)) {
      return res.status(400).json({ message: "Choose a valid support category." });
    }
    if (typeof subject !== "string" || subject.trim().length < 5 || subject.trim().length > 120) {
      return res.status(400).json({ message: "Subject must be between 5 and 120 characters." });
    }
    if (!validMessage(message)) {
      return res.status(400).json({ message: "Message must be between 5 and 4,000 characters." });
    }
    if (reference !== undefined && reference !== null &&
      (typeof reference !== "string" || reference.trim().length > 120)) {
      return res.status(400).json({ message: "Reference must be 120 characters or fewer." });
    }

    const ticket = await SupportTicket.create({
      userId: req.user.id,
      category,
      subject: subject.trim(),
      reference: reference?.trim() || null,
      messages: [{
        authorType: "customer",
        authorId: req.user.id,
        body: message.trim(),
      }],
      statusHistory: [{
        status: "open",
        actorType: "customer",
        actorId: req.user.id,
      }],
    });
    return res.status(201).json(ticket);
  } catch (error) {
    console.error("Support ticket creation failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Your support request could not be saved. Please try again." });
  }
};

export const listMySupportTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user.id })
      .sort({ updatedAt: -1 })
      .limit(50);
    return res.json(tickets);
  } catch (error) {
    console.error("Customer support ticket list failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Support requests could not be loaded." });
  }
};

export const addCustomerSupportMessage = async (req, res) => {
  try {
    if (!validateTicketId(req.params.ticketId, res)) return;
    const { message } = req.body ?? {};
    if (!validMessage(message)) {
      return res.status(400).json({ message: "Message must be between 5 and 4,000 characters." });
    }

    const ticket = await SupportTicket.findOne({
      _id: req.params.ticketId,
      userId: req.user.id,
    });
    if (!ticket) return res.status(404).json({ message: "Support request not found." });

    ticket.messages.push({
      authorType: "customer",
      authorId: req.user.id,
      body: message.trim(),
    });
    if (ticket.status === "resolved" || ticket.status === "closed") {
      ticket.status = "open";
      ticket.statusHistory.push({
        status: "open",
        actorType: "customer",
        actorId: req.user.id,
      });
    }
    await ticket.save();
    return res.json(ticket);
  } catch (error) {
    console.error("Customer support reply failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Your reply could not be saved. Please try again." });
  }
};

export const listAdminSupportTickets = async (req, res) => {
  try {
    const { status, category } = req.query;
    if (status && !TICKET_STATUSES.has(status)) {
      return res.status(400).json({ message: "Choose a valid support status." });
    }
    if (category && !TICKET_CATEGORIES.has(category)) {
      return res.status(400).json({ message: "Choose a valid support category." });
    }

    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    const tickets = await SupportTicket.find(filter)
      .populate("userId", "fullName username email")
      .sort({ updatedAt: -1 })
      .limit(100);
    return res.json(tickets);
  } catch (error) {
    console.error("Admin support ticket list failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Support requests could not be loaded." });
  }
};

export const updateAdminSupportTicket = async (req, res) => {
  try {
    if (!validateTicketId(req.params.ticketId, res)) return;
    const { status, message } = req.body ?? {};
    if (status !== undefined && !TICKET_STATUSES.has(status)) {
      return res.status(400).json({ message: "Choose a valid support status." });
    }
    if (message !== undefined && !validMessage(message)) {
      return res.status(400).json({ message: "Reply must be between 5 and 4,000 characters." });
    }
    if (status === undefined && message === undefined) {
      return res.status(400).json({ message: "Provide a status update or a reply." });
    }

    const ticket = await SupportTicket.findById(req.params.ticketId);
    if (!ticket) return res.status(404).json({ message: "Support request not found." });

    if (status !== undefined && status !== ticket.status) {
      ticket.status = status;
      ticket.statusHistory.push({
        status,
        actorType: "admin",
        actorId: req.user.id,
      });
    }
    if (message !== undefined) {
      ticket.messages.push({
        authorType: "admin",
        authorId: req.user.id,
        body: message.trim(),
      });
    }
    await ticket.save();
    return res.json(ticket);
  } catch (error) {
    console.error("Admin support ticket update failed:", error.code || error.name || "unclassified_error");
    return res.status(500).json({ message: "Support request could not be updated." });
  }
};
