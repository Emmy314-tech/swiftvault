import api from "../api";
import { postIdempotently } from "../utils/idempotentRequest.js";
import { authorizeSensitiveAction } from "./securityService.js";

export const lookupRecipient = (phone) =>
  api.get(`/transfer/lookup/${phone}`);

export const sendMoney = (payload) =>
  postIdempotently(api, "/transfer/send", payload, ["pin"], "transfer");

export const getBeneficiaries = () =>
  api.get("/transfer/beneficiaries");

export const deleteBeneficiary = async (id) => {
  const token = await authorizeSensitiveAction("beneficiary_change", {}, { id: String(id) });
  return api.delete(`/transfer/beneficiaries/${id}`, { headers: { "X-Step-Up-Token": token } });
};
