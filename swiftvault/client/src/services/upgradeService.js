import api from "../api";
import { postIdempotently } from "../utils/idempotentRequest.js";

export const purchaseUpgrade = (payload) =>
  postIdempotently(api, "/upgrade/purchase", payload, ["pin"], "membership_purchase");

export const getUpgradeFee = () => api.get("/upgrade/fee");
