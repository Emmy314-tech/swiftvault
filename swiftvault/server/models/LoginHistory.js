import mongoose from "mongoose";

const loginHistorySchema = new mongoose.Schema(
{
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  ipAddress: String,

  userAgent: String,

  device: String,

  platform: String,

  location: {
    type: String,
    default: "Unknown",
  },

  success: {
    type: Boolean,
    default: true,
  }
},
{
  timestamps: true,
}
);

export default mongoose.model("LoginHistory", loginHistorySchema);
