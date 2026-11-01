import api from "../api";
import { authorizeSensitiveAction } from "./securityService.js";

// Dashboard / Analytics
export const getAdminDashboard = () => api.get("/admin/dashboard");
export const getCompanyWalletSummary = () => api.get("/admin/company-wallet");
export const getUserStatistics = () => api.get("/admin/stats/users");
export const getTransactionStatistics = () => api.get("/admin/stats/transactions");
export const getFinancialLedgerStatus = () => api.get("/admin/financial-ledger/status");
export const getPromotionalReserve = () => api.get("/admin/promotional-reserve");
export const fundPromotionalReserve = (payload) => api.post("/admin/promotional-reserve/fund", payload);
export const updateWelcomeBonusStatus = (payload) => api.patch("/admin/promotional-reserve/welcome-bonus", payload);
export const getFinancialLedgerReport = (params) => api.get("/admin/financial-ledger", { params });
export const exportFinancialLedger = (params) => api.get("/admin/financial-ledger/export", { params, responseType: "blob" });
export const listFinancialLedgerBackfillIssues = (params) => api.get("/admin/financial-ledger/backfill-issues", { params });
export const recordOperatingExpense = (payload) => api.post("/admin/financial-ledger/expenses", payload);
export const recordProviderCommission = (payload) => api.post("/admin/financial-ledger/commissions", payload);
export const settleProviderCommission = (payload) => api.post("/admin/financial-ledger/commissions/settlements", payload);
export const reverseOperatingExpense = (reference, payload) =>
  api.post(`/admin/financial-ledger/expenses/${encodeURIComponent(reference)}/reverse`, payload);

// User Management
export const listAllUsers = () => api.get("/admin/users");
export const getUserDetail = (userId) => api.get(`/admin/users/${userId}`);
export const adjustUserBalance = async (payload) => {
  const token = await authorizeSensitiveAction("admin_balance_adjustment", payload);
  return api.post("/admin/users/adjust-balance", payload, { headers: { "X-Step-Up-Token": token } });
};
export const toggleSuspendUser = (userId, payload) => api.patch(`/admin/users/${userId}/toggle-suspend`, payload);
export const updateUserTier = (userId, payload) => api.patch(`/admin/users/${userId}/tier`, payload);
export const updateUserUpgradeStatus = (userId, payload) => api.patch(`/admin/users/${userId}/upgrade-status`, payload);

// Transaction Management
export const getAllTransactions = (params) => api.get("/admin/transactions", { params });
export const resolveTransaction = (payload) => api.post("/admin/transactions/resolve", payload);
export const getPendingReconciliation = (params) => api.get("/admin/reconciliation", { params });
export const reconcileTransaction = (transactionId, payload) => api.post(`/admin/reconciliation/${transactionId}`, payload);
export const getReconciliationAttempts = (transactionId) => api.get(`/admin/reconciliation/${transactionId}/attempts`);

// Notifications
export const broadcastNotification = (payload) => api.post("/admin/notifications/broadcast", payload);
export const sendIndividualNotification = (payload) => api.post("/admin/notifications/send", payload);

// Admin Activity Log
export const getAdminActivityLog = (params) => api.get("/admin/activity-log", { params });

// Financial Audit Trail
export const getFinancialAuditLog = (params) => api.get("/admin/financial-audit-log", { params });

// Webhook Logs
export const getWebhookLogs = (params) => api.get("/admin/webhook-logs", { params });

// Admin PIN
export const setAdminPin = async (payload) => {
  const token = await authorizeSensitiveAction("admin_pin_change", payload);
  return api.post("/pin/set-admin-pin", payload, { headers: { "X-Step-Up-Token": token } });
};

// Business Control Center (Settings)
export const getBusinessSettings = () => api.get("/settings");
export const updatePricing = (payload) => api.patch("/settings/pricing", payload);
export const updateUpgradeFees = (payload) => api.patch("/settings/upgrade-fees", payload);
export const updateTransferFees = (payload) => api.patch("/settings/transfer-fees", payload);
export const updateTransactionPolicyLimits = (payload) => api.patch("/settings/transaction-policy/limits", payload);
export const updateServiceToggles = (payload) => api.patch("/settings/services", payload);
export const updateSystemSettings = (payload) => api.patch("/settings/system", payload);
export const updateApiCredential = (payload) => api.patch("/settings/credentials", payload);

// Company Bank Accounts
export const createBankAccount = (payload) => api.post("/settings/bank-accounts", payload);
export const editBankAccount = (id, payload) => api.patch(`/settings/bank-accounts/${id}`, payload);
export const deleteBankAccount = (id, payload) => api.delete(`/settings/bank-accounts/${id}`, { data: payload });
