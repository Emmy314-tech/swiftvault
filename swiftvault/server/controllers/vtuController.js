import { fetchNetworks, fetchPlans, purchaseData } from "./dataController.js";
import { fetchAirtimeNetworks, purchaseAirtime } from "./airtimeController.js";
import { fetchCableProviders, fetchCablePlans, verifyCableDecoder, purchaseCable } from "./cableController.js";
import { fetchElectricityPlans, verifyElectricityMeter, purchaseElectricity } from "./electricityController.js";
import { fetchEpinNetworks, purchaseEpinCards } from "./epinController.js";
import { fetchExamProviders, purchaseEducationPin } from "./educationController.js";
import { resolveManagedProviderPrice } from "../services/providerPricingService.js";
import { isPositiveInteger } from "../utils/financialValidation.js";

export const quoteVtuPrice = async (req, res) => {
  try {
    const { service, provider, product } = req.query;
    const units = req.query.units === undefined ? 1 : Number(req.query.units);
    if (!provider || !product || !isPositiveInteger(units)) {
      return res.status(400).json({ message: "Provider, product, and a positive integer quantity are required." });
    }
    const quote = await resolveManagedProviderPrice({
      service,
      provider,
      product,
      units,
      user: req.user,
    });
    return res.json({ success: true, sellingPrice: quote.sellingPrice });
  } catch (err) {
    return res.status(409).json({ message: err.message });
  }
};

// Export everything required by vtuRoutes.js
export { fetchNetworks, fetchPlans, purchaseData };
export { fetchAirtimeNetworks, purchaseAirtime };
export { fetchCableProviders, fetchCablePlans, verifyCableDecoder, purchaseCable };
export { fetchElectricityPlans, verifyElectricityMeter, purchaseElectricity };
export { fetchEpinNetworks, purchaseEpinCards };
export { fetchExamProviders, purchaseEducationPin };
