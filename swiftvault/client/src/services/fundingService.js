import api from "../api";
import { postIdempotently } from "../utils/idempotentRequest.js";

export const getPaystackFundingStatus = () => api.get("/funding/paystack/status");
export const getPaystackDedicatedAccount = () => api.get("/funding/paystack/dedicated-account");
export const assignPaystackDedicatedAccount = (payload) => api.post("/funding/paystack/dedicated-account/assign", payload);
export const initializePaystackFunding = (payload) =>
	postIdempotently(api, "/funding/paystack/initialize", payload, ["pin"], "wallet_funding");
export const verifyPaystackFunding = (reference) => api.post("/funding/paystack/verify", { reference });
