import dotenv from "dotenv";
import mongoose from "mongoose";
import Transaction from "./models/Transaction.js";

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

const txns = await Transaction.find().sort({ createdAt: -1 }).limit(5);

console.log(txns);

process.exit();
