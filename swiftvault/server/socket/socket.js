import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

let io;

// `origin` is optional - when provided (via CORS_ORIGIN env), only those
// origin(s) may open a socket connection; otherwise it stays open for local dev.
export const initSocket = (server, origin) => {
  io = new Server(server, {
    cors: {
      origin: origin || "*",
      methods: ["GET", "POST"],
    },
  });

  io.use(async (socket, next) => {
    const authorization = socket.handshake.headers.authorization;
    const token = socket.handshake.auth?.token || authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return next(new Error("Unauthorized"));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("_id isSuspended");
      if (!user || user.isSuspended) return next(new Error("Unauthorized"));
      socket.data.userId = String(user._id);
      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    console.log("🔌 User connected:", socket.id);
    socket.join(socket.data.userId);

    socket.on("disconnect", () => {
      console.log("❌ User disconnected");
    });
  });

  return io;
};

export const getIO = () => io;
