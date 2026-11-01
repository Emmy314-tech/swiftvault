import express from "express";
import { protect, optionalAuth } from "../middleware/authMiddleware.js";
import { requireServiceEnabled } from "../middleware/serviceToggle.js";
import { requirePeyflexEndpoint } from "../middleware/peyflexContract.js";
import { requirePurchaseIdempotency } from "../middleware/purchaseIdempotency.js";
import { requireTransactionPolicy } from "../middleware/requireTransactionPolicy.js";
import { requireOutgoingSecurityCooldownCleared, requireStepUp } from "../middleware/securityGuards.js";
import { financialMutationRateLimiter } from "../middleware/rateLimiter.js";
import {
  fetchNetworks,
  fetchPlans,
  purchaseData,
  fetchAirtimeNetworks,
  purchaseAirtime,
  fetchCableProviders,
  fetchCablePlans,
  verifyCableDecoder,
  purchaseCable,
  fetchElectricityPlans,
  verifyElectricityMeter,
  purchaseElectricity,
  fetchEpinNetworks,
  purchaseEpinCards,
  fetchExamProviders,
  purchaseEducationPin,
  quoteVtuPrice
} from "../controllers/vtuController.js";

const router = express.Router();

router.get("/quote", protect, quoteVtuPrice);
// optionalAuth on the public GET routes: still accessible without a token, but
// logged-in users get their real tier's selling price on plan listings.
router.get("/networks", optionalAuth, requirePeyflexEndpoint("data.networks"), fetchNetworks);
router.get("/plans", optionalAuth, requirePeyflexEndpoint("data.plans"), fetchPlans);
router.post("/purchase", protect, financialMutationRateLimiter, requirePeyflexEndpoint("data.purchase"), requireServiceEnabled("data"), requireTransactionPolicy("service", "data"), requireOutgoingSecurityCooldownCleared, requireStepUp("service_purchase"), requirePurchaseIdempotency("data_purchase"), purchaseData);

router.get("/airtime/networks", optionalAuth, requirePeyflexEndpoint("airtime.networks"), fetchAirtimeNetworks);
router.post("/airtime/purchase", protect, financialMutationRateLimiter, requirePeyflexEndpoint("airtime.purchase"), requireServiceEnabled("airtime"), requireTransactionPolicy("service", "airtime"), requireOutgoingSecurityCooldownCleared, requireStepUp("service_purchase"), requirePurchaseIdempotency("airtime"), purchaseAirtime);

router.get("/cable/providers", optionalAuth, requirePeyflexEndpoint("cable.providers"), fetchCableProviders);
router.get("/cable/plans", optionalAuth, requirePeyflexEndpoint("cable.plans"), fetchCablePlans);
router.post("/cable/verify", protect, financialMutationRateLimiter, requirePeyflexEndpoint("cable.verify"), verifyCableDecoder);
router.post("/cable/purchase", protect, financialMutationRateLimiter, requirePeyflexEndpoint("cable.subscribe.request"), requireServiceEnabled("cable"), requireTransactionPolicy("service", "cable"), requireOutgoingSecurityCooldownCleared, requireStepUp("service_purchase"), requirePurchaseIdempotency("cable_tv"), purchaseCable);

router.get("/electricity/plans", optionalAuth, requirePeyflexEndpoint("electricity.plans"), fetchElectricityPlans);
router.post("/electricity/verify", protect, financialMutationRateLimiter, requirePeyflexEndpoint("electricity.verify"), verifyElectricityMeter);
router.post("/electricity/purchase", protect, financialMutationRateLimiter, requirePeyflexEndpoint("electricity.purchase"), requireServiceEnabled("electricity"), requireTransactionPolicy("service", "electricity"), requireOutgoingSecurityCooldownCleared, requireStepUp("service_purchase"), requirePurchaseIdempotency("electricity"), purchaseElectricity);

// --- RECHARGE CARD PRINTING (ePIN) ROUTES ---
router.get("/epin/options", protect, requirePeyflexEndpoint("epin.options"), fetchEpinNetworks);
router.post("/epin/purchase", protect, financialMutationRateLimiter, requirePeyflexEndpoint("epin.purchase"), requireServiceEnabled("epin"), requireTransactionPolicy("service", "epin"), requireOutgoingSecurityCooldownCleared, requireStepUp("service_purchase"), requirePurchaseIdempotency("epin"), purchaseEpinCards);

// --- EDUCATION / EXAM PIN ROUTES ---
router.get("/education/providers", protect, requirePeyflexEndpoint("education.providers"), fetchExamProviders);
router.post("/education/purchase", protect, financialMutationRateLimiter, requirePeyflexEndpoint("education.purchase"), requireServiceEnabled("education"), requireTransactionPolicy("service", "education"), requireOutgoingSecurityCooldownCleared, requireStepUp("service_purchase"), requirePurchaseIdempotency("exam_pin"), purchaseEducationPin);

export default router;
