import api from "../api";

export const getMySupportTickets = () => api.get("/support");
export const createSupportTicket = (payload) => api.post("/support", payload);
export const replyToSupportTicket = (ticketId, message) =>
  api.post(`/support/${ticketId}/messages`, { message });
export const getAdminSupportTickets = (params) =>
  api.get("/admin/support-tickets", { params });
export const updateAdminSupportTicket = (ticketId, payload) =>
  api.patch(`/admin/support-tickets/${ticketId}`, payload);
