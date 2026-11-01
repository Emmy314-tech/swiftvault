import { assertPeyflexEndpointAvailable } from "../services/peyflexService.js";

export const requirePeyflexEndpoint = (endpoint) => (req, res, next) => {
  try {
    assertPeyflexEndpointAvailable(endpoint);
    return next();
  } catch (error) {
    if (error.code !== "PEYFLEX_CONTRACT_UNVERIFIED") return next(error);
    return res.status(503).json({ message: error.message });
  }
};
