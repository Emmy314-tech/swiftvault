import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  title: {
    type: String,
    required: true
  },

  message: {
    type: String,
    required: true
  },

  type: {
    type: String,
    enum: [
      "wallet",
      "transfer",
      "vtu",
      "bonus",
      "security",
      "announcement",
      "promotion",
      "system"
    ],
    default: "system"
  },

  icon: {
    type: String,
    default: "🔔"
  },

  actionUrl: {
    type: String,
    default: ""
  },

  priority: {
    type: String,
    enum: [
      "low",
      "normal",
      "high"
    ],
    default: "normal"
  },

  read: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

export default mongoose.model(
  "Notification",
  notificationSchema
);
