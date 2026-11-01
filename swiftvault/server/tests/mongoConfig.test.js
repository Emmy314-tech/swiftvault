import assert from "node:assert/strict";
import test from "node:test";
import { assertMongoDatabaseTarget, getMongoDatabaseName } from "../config/mongoConfig.js";

test("MongoDB target parsing returns the database name without exposing URI contents", () => {
  assert.equal(
    getMongoDatabaseName("mongodb+srv://user:password@cluster.example.mongodb.net/swiftvault_staging?retryWrites=true"),
    "swiftvault_staging",
  );
});

test("staging startup accepts only the dedicated staging database", () => {
  const stagingUri = "mongodb+srv://staging:secret@cluster.example.mongodb.net/swiftvault_staging";
  assert.equal(assertMongoDatabaseTarget(stagingUri, "staging"), "swiftvault_staging");
  assert.throws(
    () => assertMongoDatabaseTarget("mongodb+srv://user:secret@cluster.example.mongodb.net/swiftvault", "staging"),
    { message: "NODE_ENV=staging requires the dedicated swiftvault_staging database." },
  );
});

test("invalid MongoDB configuration errors do not include URI values", () => {
  assert.throws(
    () => getMongoDatabaseName("not-a-mongodb-uri-with-secret"),
    (error) => {
      assert.equal(error.message, "MONGO_URI must be a valid MongoDB connection URI.");
      assert.equal(error.message.includes("secret"), false);
      return true;
    },
  );
});
