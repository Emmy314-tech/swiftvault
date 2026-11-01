import api from "../api";
import { postIdempotently } from "../utils/idempotentRequest.js";

const submitPurchase = (path, payload) => postIdempotently(api, path, payload, ["pin"], "service_purchase");

export const getVtuQuote = (params) => api.get("/vtu/quote", { params });

// Data
export const getNetworks = () => api.get("/vtu/networks");
export const getPlans = (params) => api.get("/vtu/plans", { params });
export const buyData = (payload) => submitPurchase("/vtu/purchase", payload);

// Airtime
export const getAirtimeNetworks = () => api.get("/vtu/airtime/networks");
export const buyAirtime = (payload) => submitPurchase("/vtu/airtime/purchase", payload);

// Cable
export const getCableProviders = () => api.get("/vtu/cable/providers");
export const getCablePlans = (params) => api.get("/vtu/cable/plans", { params });
export const verifyDecoder = (payload) => api.post("/vtu/cable/verify", payload);
export const buyCable = (payload) => submitPurchase("/vtu/cable/purchase", payload);

// Electricity
export const getElectricityPlans = () => api.get("/vtu/electricity/plans");
export const verifyMeter = (payload) => api.post("/vtu/electricity/verify", payload);
export const buyElectricity = (payload) => submitPurchase("/vtu/electricity/purchase", payload);

// ePIN
export const getEpinOptions = () => api.get("/vtu/epin/options");
export const buyEpin = (payload) => submitPurchase("/vtu/epin/purchase", payload);

// Education
export const getEducationProviders = () => api.get("/vtu/education/providers");
export const buyEducationPin = (payload) => submitPurchase("/vtu/education/purchase", payload);
