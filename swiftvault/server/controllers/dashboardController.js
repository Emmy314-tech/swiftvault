import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

export const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);

    const transactions = await Transaction.find({ userId }).select("-provider_response -idempotencyKey -requestFingerprint -balanceBefore -providerCost -upgradeAllocation");

    const totalTransactions = transactions.length;

    const successfulTransactions = transactions.filter(
      (t) => t.status === "success"
    ).length;

    const failedTransactions = transactions.filter(
      (t) => t.status === "failed"
    ).length;

    const totalSpent = transactions
      .filter((t) => t.status === "success")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const recentTransactions = await Transaction.find({ userId })
      .select("-provider_response -idempotencyKey -requestFingerprint -balanceBefore -providerCost -upgradeAllocation")
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      walletBalance: user.walletBalance,
      bonusBalance: user.bonusBalance || 0,
      totalBalance: (user.walletBalance || 0) + (user.bonusBalance || 0),
      totalTransactions,
      successfulTransactions,
      failedTransactions,
      totalSpent,
      referralCode: user.referralCode,
      recentTransactions,
    });

  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};
