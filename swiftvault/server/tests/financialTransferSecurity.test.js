import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/User.js";
import { getWallet } from "../controllers/userController.js";
import { sendMoney } from "../controllers/transferController.js";
import { protect } from "../middleware/authMiddleware.js";
import { financialMutationRateLimiter } from "../middleware/rateLimiter.js";
import transferRoutes from "../routes/transferRoutes.js";
import userRoutes from "../routes/userRoutes.js";

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const getRouteHandlers = (router, method, path) => {
  const layer = router.stack.find((entry) =>
    entry.route?.path === path && entry.route.methods[method]
  );
  assert.ok(layer, `Expected ${method.toUpperCase()} ${path} route`);
  return layer.route.stack.map(({ handle }) => handle);
};

const makeTransferSession = () => ({
  active: false,
  startTransaction() { this.active = true; },
  inTransaction() { return this.active; },
  async commitTransaction() { this.active = false; },
  async abortTransaction() { this.active = false; },
  endSession() {},
});

test("internal transfer binds the sender to the authenticated user and rejects insufficient funds", async (context) => {
  const session = makeTransferSession();
  const sender = {
    _id: "authenticated-sender",
    phone: "08011111111",
    pin: "stored-hash",
    walletBalance: 10,
    dailyTransferDate: new Date(),
    dailyTransferAmount: 0,
    rapidTransferCount: 0,
    async save() {},
  };
  let queriedSenderId;
  let recipientQueries = 0;
  context.mock.method(mongoose, "startSession", async () => session);
  context.mock.method(User, "findById", (id) => {
    queriedSenderId = id;
    return { session: async () => sender };
  });
  context.mock.method(User, "findOne", () => {
    recipientQueries += 1;
    return { session: async () => ({}) };
  });
  context.mock.method(bcrypt, "compare", async () => true);

  const res = response();
  await sendMoney({
    user: { id: "authenticated-sender" },
    body: {
      userId: "attacker-selected-user",
      phone: "08022222222",
      amount: 11,
      pin: "1234",
    },
  }, res);

  assert.equal(queriedSenderId, "authenticated-sender");
  assert.equal(recipientQueries, 1);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /insufficient balance/i);
  assert.equal(session.active, false);
});

test("internal transfer rejects an incorrect transaction PIN before recipient lookup", async (context) => {
  const session = makeTransferSession();
  const sender = {
    _id: "authenticated-sender",
    pin: "stored-hash",
    pinAttempts: 0,
    walletBalance: 100,
    dailyTransferDate: new Date(),
    async save() { this.saved = true; },
  };
  let recipientQueries = 0;
  context.mock.method(mongoose, "startSession", async () => session);
  context.mock.method(User, "findById", () => ({ session: async () => sender }));
  context.mock.method(User, "findOne", () => { recipientQueries += 1; });
  context.mock.method(bcrypt, "compare", async () => false);

  const res = response();
  await sendMoney({
    user: { id: "authenticated-sender" },
    body: { phone: "08022222222", amount: 5, pin: "0000" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /incorrect PIN/i);
  assert.equal(sender.pinAttempts, 1);
  assert.equal(sender.saved, true);
  assert.equal(recipientQueries, 0);
  assert.equal(session.active, false);
});

test("wallet read always uses the authenticated owner, not a supplied user ID", async (context) => {
  let queriedId;
  context.mock.method(User, "findById", async (id) => {
    queriedId = id;
    return { walletBalance: 7, bonusBalance: 3 };
  });

  const res = response();
  await getWallet({
    user: { id: "authenticated-owner" },
    body: { userId: "attacker-selected-user" },
  }, res);

  assert.equal(queriedId, "authenticated-owner");
  assert.deepEqual(res.body, { walletBalance: 7, bonusBalance: 3, totalBalance: 10 });
});

test("wallet and transfer endpoints require authentication and transfers are rate limited", () => {
  const walletHandlers = getRouteHandlers(userRoutes, "get", "/wallet");
  assert.ok(walletHandlers.includes(protect));

  const transferHandlers = getRouteHandlers(transferRoutes, "post", "/send");
  assert.ok(transferHandlers.includes(protect));
  assert.ok(transferHandlers.includes(financialMutationRateLimiter));
});
