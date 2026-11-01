import api from "../api";

export const getKycOverview = () => api.get("/kyc");
export const startKycTier = (tier) => api.post(`/kyc/tiers/${tier}/start`);
export const getAdminKycProfiles = () => api.get("/admin/kyc");
export const reviewTierThree = (userId, payload) => api.post(`/admin/kyc/${userId}/tier3/review`, payload);
