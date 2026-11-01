import api from "../api";

export const getDashboard = async () => {
  const { data } = await api.get("/dashboard");
  return data;
};

export const getUserDashboard = async () => {
  const { data } = await api.get("/user/dashboard");
  return data;
};

export const getProfile = async () => {
  const { data } = await api.get("/user/profile");
  return data;
};
