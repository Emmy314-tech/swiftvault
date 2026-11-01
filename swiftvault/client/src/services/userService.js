import api from "../api";

export const getProfile = () =>
  api.get("/user/profile");

export const updateProfile = (payload) =>
  api.put("/user/update", payload);

export const claimWelcomeBonus = () =>
  api.post("/user/welcome-bonus/claim");

export const getWallet = () =>
  api.get("/user/wallet");

export const getDashboard = () =>
  api.get("/dashboard");
