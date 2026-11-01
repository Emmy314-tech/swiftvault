export const classifyPeyflexResponse = (_response, _endpoint) => "pending";

export const isDefinitivePeyflexFailure = (error) => {
  if (error?.code === "PEYFLEX_NOT_CONFIGURED" ||
    error?.code === "PEYFLEX_INVALID_BASE_URL" ||
    error?.code === "PEYFLEX_CONTRACT_UNVERIFIED") return true;
  return false;
};