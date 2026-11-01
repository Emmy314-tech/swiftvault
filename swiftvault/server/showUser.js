import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "./models/User.js";

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

const user = await User.findOne({ email: "john@example.com" });

console.log(user);

process.exit();
