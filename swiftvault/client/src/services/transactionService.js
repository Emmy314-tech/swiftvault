import api from "../api";

export const getTransactions = () =>
  api.get("/transactions/me");

export const getTransactionByReference = async (reference) => {
  const { data } = await getTransactions();
  return data.find((transaction) => transaction.reference === reference) || null;
};
