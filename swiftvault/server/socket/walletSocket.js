import { getIO } from "./socket.js";

export const emitWalletUpdate = (userId, balance) => {
  const io = getIO();

  if (!io) return;

  io.to(String(userId)).emit("walletUpdated", {
    balance,
  });
};
