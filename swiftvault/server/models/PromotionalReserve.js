import mongoose from "mongoose";

const promotionalReserveSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "primary" },
  fundedBalance: { type: Number, default: 0, min: 0 },
  availableBalance: { type: Number, default: 0, min: 0 },
  awardedTotal: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

export default mongoose.model("PromotionalReserve", promotionalReserveSchema);
