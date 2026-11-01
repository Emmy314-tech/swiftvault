import api from "../api";

export const getLoginHistory = () => api.get("/login-history");
