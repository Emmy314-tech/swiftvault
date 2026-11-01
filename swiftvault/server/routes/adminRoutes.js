import express from "express";
import {
  getAdminDashboard, listUsers, adjustUserBalance,
  getAllTransactions, resolveTransaction,
  getCompanyWalletSummary, getUserStatistics, getTransactionStatistics,
  toggleSuspendUser, getUserDetail,
  updateUserTier, updateUserUpgradeStatus,
  broadcastNotification, sendIndividualNotification,
  getAdminActivityLog,
  getFinancialAuditLog,
  getWebhookLogs,
  listPendingReconciliation,
  reconcileTransaction,
  getReconciliationAttempts,
  listAdminKycProfiles,
  reviewTierThree,
} from "../controllers/adminController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/admin.js";
import { requireAdminPin } from "../middleware/requireAdminPin.js";
import { requireStepUp } from "../middleware/securityGuards.js";
import { financialMutationRateLimiter } from "../middleware/rateLimiter.js";
import {
  exportFinancialLedger,
  getFinancialLedgerReport,
  getFinancialLedgerStatus,
  listFinancialLedgerBackfillIssues,
  recordOperatingExpense,
  recordProviderCommission,
  reverseOperatingExpense,
  settleProviderCommission,
} from "../controllers/financialLedgerController.js";
import {
  listAdminSupportTickets,
  updateAdminSupportTicket,
} from "../controllers/supportController.js";
import {
  getPromotionalReserve,
  fundPromotionalReserve,
  updateWelcomeBonusStatus,
} from "../controllers/promotionalReserveController.js";

const router = express.Router();

// All routes require login (protect) AND admin privileges (adminOnly)
router.use(protect, adminOnly);

router.get("/dashboard", getAdminDashboard);
router.get("/company-wallet", getCompanyWalletSummary);
router.get("/stats/users", getUserStatistics);
router.get("/stats/transactions", getTransactionStatistics);
router.get("/financial-ledger/status", getFinancialLedgerStatus);
router.get("/financial-ledger/backfill-issues", listFinancialLedgerBackfillIssues);
router.get("/financial-ledger", getFinancialLedgerReport);
router.get("/promotional-reserve", getPromotionalReserve);
router.post("/promotional-reserve/fund", financialMutationRateLimiter, requireAdminPin, fundPromotionalReserve);
router.patch("/promotional-reserve/welcome-bonus", financialMutationRateLimiter, requireAdminPin, updateWelcomeBonusStatus);
router.get("/financial-ledger/export", exportFinancialLedger);
router.post("/financial-ledger/expenses", financialMutationRateLimiter, requireAdminPin, recordOperatingExpense);
router.post("/financial-ledger/commissions", financialMutationRateLimiter, requireAdminPin, recordProviderCommission);
router.post("/financial-ledger/commissions/settlements", financialMutationRateLimiter, requireAdminPin, settleProviderCommission);
router.post("/financial-ledger/expenses/:reference/reverse", financialMutationRateLimiter, requireAdminPin, reverseOperatingExpense);

router.get("/users", listUsers);
router.get("/users/:userId", getUserDetail);
router.post("/users/adjust-balance", financialMutationRateLimiter, requireStepUp("admin_balance_adjustment"), requireAdminPin, adjustUserBalance);
router.patch("/users/:userId/toggle-suspend", financialMutationRateLimiter, requireAdminPin, toggleSuspendUser);
router.patch("/users/:userId/tier", financialMutationRateLimiter, requireAdminPin, updateUserTier);
router.patch("/users/:userId/upgrade-status", financialMutationRateLimiter, requireAdminPin, updateUserUpgradeStatus);
router.get("/kyc", listAdminKycProfiles);
router.post("/kyc/:userId/tier3/review", financialMutationRateLimiter, requireAdminPin, reviewTierThree);

router.get("/transactions", getAllTransactions);
router.post("/transactions/resolve", resolveTransaction);
router.get("/reconciliation", listPendingReconciliation);
router.post("/reconciliation/:transactionId", financialMutationRateLimiter, requireAdminPin, reconcileTransaction);
router.get("/reconciliation/:transactionId/attempts", getReconciliationAttempts);

router.post("/notifications/broadcast", broadcastNotification);
router.post("/notifications/send", sendIndividualNotification);

router.get("/activity-log", getAdminActivityLog);
router.get("/financial-audit-log", getFinancialAuditLog);
router.get("/webhook-logs", getWebhookLogs);
router.get("/support-tickets", listAdminSupportTickets);
router.patch("/support-tickets/:ticketId", updateAdminSupportTicket);

export default router;
