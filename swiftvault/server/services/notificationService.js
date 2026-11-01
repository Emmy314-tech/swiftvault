import Notification from "../models/Notification.js";
import { getIO } from "../socket/socket.js";

export async function sendNotification({
  userId,
  title,
  message,
  type = "system",
  icon = "🔔",
  priority = "normal",
  actionUrl = "",
}) {
  try {
    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
      icon,
      priority,
      actionUrl,
    });

    const io = getIO();

    if (io) {
      io.to(String(userId)).emit("newNotification", notification);
    }

    return notification;
  } catch (err) {
    console.error("Notification Error:", err.message);
    throw err;
  }
}
