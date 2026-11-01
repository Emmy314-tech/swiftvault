import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";

dotenv.config();

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required to run this migration.");
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.collection.find(
    { $or: [{ tier: { $exists: false } }, { tier: null }] },
    { projection: { _id: 1, role: 1 } }
  ).toArray();

  if (users.length) {
    await User.collection.bulkWrite(users.map((user) => {
      const tier = ["retail", "wholesale"].includes(user.role) ? user.role : "normal";
      return {
        updateOne: {
          filter: { _id: user._id, $or: [{ tier: { $exists: false } }, { tier: null }] },
          update: { $set: { tier, role: user.role === "admin" ? "admin" : "user" } },
        },
      };
    }));
  }

  console.log(`Tier migration complete. Updated ${users.length} user record(s).`);
};

run()
  .catch((error) => {
    console.error("Tier migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
