import Transaction from "../models/Transaction.js";

export const getMyTransactions = async (req, res) => {
  try {
    const userId = req.user.id;

    const transactions = await Transaction.find({
      userId
    }).select("-provider_response -idempotencyKey -requestFingerprint -balanceBefore -providerCost -providerFee -pricingSnapshot -upgradeAllocation").sort({ createdAt: -1 });

    return res.json(transactions);

  } catch (err) {
    return res.status(500).json({
      message: err.message
    });
  }
};
