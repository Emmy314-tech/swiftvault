import "./config/loadEnv.js";
import express from "express";
import mongoose from "mongoose";
import Transaction from "./models/Transaction.js";
import ReconciliationAttempt from "./models/ReconciliationAttempt.js";
import FinancialJournal from "./models/FinancialJournal.js";
import FinancialLedgerControl from "./models/FinancialLedgerControl.js";
import FinancialLedgerBackfillIssue from "./models/FinancialLedgerBackfillIssue.js";
import AuthSession from "./models/AuthSession.js";
import SupportTicket from "./models/SupportTicket.js";
import PasskeyCredential from "./models/PasskeyCredential.js";
import WebAuthnChallenge from "./models/WebAuthnChallenge.js";
import StepUpGrant from "./models/StepUpGrant.js";
import SecurityAuditEvent from "./models/SecurityAuditEvent.js";
import cors from "cors";
import helmet from "helmet";
import http from "http";

import { initSocket } from "./socket/socket.js";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import resetRoutes from "./routes/resetRoutes.js";
import upgradeRoutes from "./routes/upgradeRoutes.js";
import verifyRoutes from "./routes/verifyRoutes.js";
import pinRoutes from "./routes/pinRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import fundingRoutes from "./routes/fundingRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import vtuRoutes from "./routes/vtuRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import transferRoutes from "./routes/transferRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import loginHistoryRoutes from "./routes/loginHistoryRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";
import securityRoutes from "./routes/securityRoutes.js";
import kycRoutes from "./routes/kycRoutes.js";
import { enforceMaintenanceMode } from "./middleware/maintenanceMode.js";
import { assertMongoDatabaseTarget } from "./config/mongoConfig.js";

const app = express();
const server = http.createServer(app);

// Set CORS_ORIGIN (comma-separated) to the frontend origin(s). Production
// startup fails closed without this allowlist; local development may omit it.
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
  : undefined;

if (process.env.NODE_ENV === "production" && !corsOrigin?.length) {
  throw new Error("CORS_ORIGIN must contain the production frontend origin(s).");
}

initSocket(server, corsOrigin);

// crossOriginResourcePolicy is relaxed here because the client runs on a
// different port/origin during development - helmet's default would otherwise
// silently block the frontend from reading API responses.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors(corsOrigin ? { origin: corsOrigin } : {}));
app.use(express.json({
  verify: (req, res, buf) => {
    // Captures exact raw webhook bytes before JSON parsing so provider HMAC
    // verification uses the signed request body, not a re-stringified object.
    req.rawBody = buf;
  },
}));

// Webhook route must be registered BEFORE the maintenance gate below so signed
// Paystack callbacks can be handled independently of maintenance mode.
app.use("/api/webhook", webhookRoutes);

// Maintenance mode gate - applies to every route registered after this line.
app.use(enforceMaintenanceMode);

// ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/reset", resetRoutes);
app.use("/api/upgrade", upgradeRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/verify", verifyRoutes);
app.use("/api/pin", pinRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/funding", fundingRoutes);
app.use("/api/vtu", vtuRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/transfer", transferRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/login-history", loginHistoryRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/security", securityRoutes);

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required to start SwiftVault.");
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }

  assertMongoDatabaseTarget(process.env.MONGO_URI, process.env.NODE_ENV);
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  await Transaction.createIndexes();
  await ReconciliationAttempt.createIndexes();
  await FinancialJournal.createIndexes();
  await FinancialLedgerControl.createIndexes();
  await FinancialLedgerBackfillIssue.createIndexes();
  await AuthSession.createIndexes();
  await SupportTicket.createIndexes();
  await PasskeyCredential.createIndexes();
  await WebAuthnChallenge.createIndexes();
  await StepUpGrant.createIndexes();
  await SecurityAuditEvent.createIndexes();
  console.log("MongoDB connected. SwiftVault ledger online.");

  server.listen(PORT, () => {
    console.log(`🚀 SwiftVault running on port ${PORT}`);
  });
};

startServer().catch((err) => {
  console.error("Server startup failed:", err.code || err.name || "unclassified_error");
  process.exit(1);
});
