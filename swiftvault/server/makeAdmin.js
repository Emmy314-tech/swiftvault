// Usage: node makeAdmin.js <phone or email or username>
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "./models/User.js";

dotenv.config();

const identifier = process.argv[2];
if (!identifier) {
  console.log("Usage: node makeAdmin.js <phone or email or username>");
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);

const user = await User.findOne({
  $or: [{ phone: identifier }, { email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }],
});

if (!user) {
  console.log(`No user found matching "${identifier}"`);
  process.exit(1);
}

user.role = "admin";
await user.save();

console.log(`✅ ${user.username} (${user.phone}) is now an admin.`);
process.exit(0);
