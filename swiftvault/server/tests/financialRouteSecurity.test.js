import assert from "node:assert/strict";
import test from "node:test";
import adminRoutes from "../routes/adminRoutes.js";
import fundingRoutes from "../routes/fundingRoutes.js";
import settingsRoutes from "../routes/settingsRoutes.js";
import transferRoutes from "../routes/transferRoutes.js";
import upgradeRoutes from "../routes/upgradeRoutes.js";
import userRoutes from "../routes/userRoutes.js";
import vtuRoutes from "../routes/vtuRoutes.js";
import { protect } from "../middleware/authMiddleware.js";
import { financialMutationRateLimiter, walletFundingRateLimiter } from "../middleware/rateLimiter.js";
import { requireAdminPin } from "../middleware/requireAdminPin.js";
import { sendMoney } from "../controllers/transferController.js";

const routeHandlers = (router, method, path) => {
  const layer = router.stack.find((entry) =>
    entry.route?.path === path && entry.route.methods[method]
  );
  assert.ok(layer, `Expected ${method.toUpperCase()} ${path} route`);
  return layer.route.stack.map(({ handle }) => handle);
};

test("customer financial mutation routes apply authentication and rate limiting", () => {
  const vtuPurchases = [
    "/purchase",
    "/airtime/purchase",
    "/cable/purchase",
    "/electricity/purchase",
    "/epin/purchase",
    "/education/purchase",
  ];
  for (const path of vtuPurchases) {
    const handlers = routeHandlers(vtuRoutes, "post", path);
    assert.ok(handlers.includes(protect), `${path} requires authentication`);
    assert.ok(handlers.includes(financialMutationRateLimiter), `${path} is rate limited`);
  }

  for (const path of ["/cable/verify", "/electricity/verify"]) {
    const handlers = routeHandlers(vtuRoutes, "post", path);
    assert.ok(handlers.includes(protect));
    assert.ok(handlers.includes(financialMutationRateLimiter));
  }

  const transferHandlers = routeHandlers(transferRoutes, "post", "/send");
  assert.ok(transferHandlers.includes(protect));
  assert.ok(transferHandlers.includes(financialMutationRateLimiter));
  assert.equal(transferHandlers[transferHandlers.length - 1], sendMoney);

  const upgradeHandlers = routeHandlers(upgradeRoutes, "post", "/purchase");
  assert.ok(upgradeHandlers.includes(protect));
  assert.ok(upgradeHandlers.includes(financialMutationRateLimiter));

  const bonusHandlers = routeHandlers(userRoutes, "post", "/welcome-bonus/claim");
  assert.ok(bonusHandlers.includes(protect));
  assert.ok(bonusHandlers.includes(financialMutationRateLimiter));
});

test("Paystack funding keeps its stricter funding limiter and authenticated routes", () => {
  for (const path of [
    "/paystack/dedicated-account/assign",
    "/paystack/initialize",
    "/paystack/verify",
  ]) {
    const handlers = routeHandlers(fundingRoutes, "post", path);
    assert.ok(handlers.includes(protect));
    assert.ok(handlers.includes(walletFundingRateLimiter));
  }
});

test("admin financial mutations remain PIN-protected and rate limited", () => {
  for (const [method, path] of [
    ["post", "/promotional-reserve/fund"],
    ["patch", "/promotional-reserve/welcome-bonus"],
    ["post", "/financial-ledger/expenses"],
    ["post", "/users/adjust-balance"],
    ["post", "/reconciliation/:transactionId"],
  ]) {
    const handlers = routeHandlers(adminRoutes, method, path);
    assert.ok(handlers.includes(financialMutationRateLimiter), `${path} is rate limited`);
    assert.ok(handlers.includes(requireAdminPin), `${path} requires Admin PIN`);
  }

  for (const [method, path] of [
    ["patch", "/pricing"],
    ["patch", "/transfer-fees"],
    ["patch", "/transaction-policy/limits"],
  ]) {
    const handlers = routeHandlers(settingsRoutes, method, path);
    assert.ok(handlers.includes(financialMutationRateLimiter), `${path} is rate limited`);
    assert.ok(handlers.includes(requireAdminPin), `${path} requires Admin PIN`);
  }
});
