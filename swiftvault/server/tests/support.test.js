import assert from "node:assert/strict";
import test from "node:test";
import SupportTicket from "../models/SupportTicket.js";
import {
  addCustomerSupportMessage,
  createSupportTicket,
  listAdminSupportTickets,
  listMySupportTickets,
  updateAdminSupportTicket,
} from "../controllers/supportController.js";

const response = () => {
  let statusCode = 200;
  let body;
  return {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
};

test("support tickets enforce indexes for customer and admin queues", () => {
  const indexes = SupportTicket.schema.indexes();
  assert.ok(indexes.some(([keys]) => keys.userId === 1 && keys.updatedAt === -1));
  assert.ok(indexes.some(([keys]) => keys.status === 1 && keys.updatedAt === -1));
});

test("customer ticket creation uses the authenticated owner and ignores client identity fields", async (context) => {
  let created;
  context.mock.method(SupportTicket, "create", async (ticket) => {
    created = ticket;
    return ticket;
  });

  const res = response();
  await createSupportTicket({
    user: { id: "authenticated-user" },
    body: {
      userId: "attacker-selected-user",
      status: "resolved",
      category: "complaint",
      subject: "Transfer status is unclear",
      reference: "TX-123",
      message: "Please confirm the latest status of my transaction.",
    },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(created.userId, "authenticated-user");
  assert.equal(created.status, undefined);
  assert.equal(created.messages[0].authorId, "authenticated-user");
  assert.equal(created.statusHistory[0].actorId, "authenticated-user");
});

test("invalid support requests are rejected before creating a ticket", async (context) => {
  let createCalls = 0;
  context.mock.method(SupportTicket, "create", async () => { createCalls += 1; });

  const res = response();
  await createSupportTicket({
    user: { id: "authenticated-user" },
    body: {
      category: "unknown",
      subject: "Issue",
      message: "Help me",
    },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(createCalls, 0);
});

test("customer ticket list is scoped to the authenticated user", async (context) => {
  let filter;
  let sortOrder;
  let resultLimit;
  const results = [{ _id: "owned-ticket" }];
  const query = {
    sort(value) { sortOrder = value; return this; },
    limit(value) { resultLimit = value; return Promise.resolve(results); },
  };
  context.mock.method(SupportTicket, "find", (value) => {
    filter = value;
    return query;
  });

  const res = response();
  await listMySupportTickets({ user: { id: "authenticated-user" } }, res);

  assert.deepEqual(filter, { userId: "authenticated-user" });
  assert.deepEqual(sortOrder, { updatedAt: -1 });
  assert.equal(resultLimit, 50);
  assert.deepEqual(res.body, results);
});

test("customer replies are owner-scoped and reopen resolved tickets with an audit event", async (context) => {
  const ticket = {
    status: "resolved",
    messages: [],
    statusHistory: [],
    async save() {},
  };
  let filter;
  context.mock.method(SupportTicket, "findOne", (value) => {
    filter = value;
    return ticket;
  });

  const res = response();
  await addCustomerSupportMessage({
    params: { ticketId: "507f1f77bcf86cd799439011" },
    user: { id: "authenticated-user" },
    body: { message: "The issue is still happening after the last update." },
  }, res);

  assert.deepEqual(filter, {
    _id: "507f1f77bcf86cd799439011",
    userId: "authenticated-user",
  });
  assert.equal(ticket.messages[0].authorType, "customer");
  assert.equal(ticket.messages[0].authorId, "authenticated-user");
  assert.equal(ticket.status, "open");
  assert.equal(ticket.statusHistory[0].actorType, "customer");
  assert.equal(ticket.statusHistory[0].status, "open");
});

test("admin updates append the authenticated responder and status to ticket history", async (context) => {
  const ticket = {
    status: "open",
    messages: [],
    statusHistory: [],
    async save() {},
  };
  context.mock.method(SupportTicket, "findById", async () => ticket);

  const res = response();
  await updateAdminSupportTicket({
    params: { ticketId: "507f1f77bcf86cd799439011" },
    user: { id: "admin-user" },
    body: {
      status: "in_review",
      message: "We are checking this transaction reference.",
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(ticket.status, "in_review");
  assert.equal(ticket.statusHistory[0].actorType, "admin");
  assert.equal(ticket.statusHistory[0].actorId, "admin-user");
  assert.equal(ticket.messages[0].authorType, "admin");
  assert.equal(ticket.messages[0].authorId, "admin-user");
});

test("admin ticket list validates filters before querying", async (context) => {
  let findCalls = 0;
  context.mock.method(SupportTicket, "find", () => { findCalls += 1; });

  const res = response();
  await listAdminSupportTickets({ query: { status: "ignored" } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(findCalls, 0);
});
