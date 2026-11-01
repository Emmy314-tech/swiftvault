import api from "../api";
import { authorizeSensitiveAction } from "./securityService.js";

export const login = (payload) =>
  api.post("/auth/login", payload);

export const register = (payload) =>
  api.post("/auth/register", payload);

export const verifyOTP = (payload) =>
  api.post("/auth/verify-otp", payload);

export const resendOtp = (payload) =>
  api.post("/auth/resend-otp", payload);

export const logout = () =>
  api.post("/auth/logout");

export const requestReset = (payload) =>
  api.post("/reset/request", payload);

export const resetPassword = (payload) =>
  api.post("/reset/reset", payload);

export const setPin = async (payload) => {
  const token = await authorizeSensitiveAction("pin_change", payload);
  return api.post("/pin/set", payload, { headers: { "X-Step-Up-Token": token } });
};
