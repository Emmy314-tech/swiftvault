import mongoose from "mongoose";

const companyWalletSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "SwiftVault Revenue Wallet",
      unique: true,
    },

    balance: {
      type: Number,
      default: 0,
    },

    totalRevenue: {
      type: Number,
      default: 0,
    },

    totalUpgradeRevenue: {
      type: Number,
      default: 0,
    },

    totalTransferFees: {
      type: Number,
      default: 0,
    },

    totalVTUProfit: {
      type: Number,
      default: 0,
    },

    totalCableProfit: {
      type: Number,
      default: 0,
    },

    totalElectricityProfit: {
      type: Number,
      default: 0,
    },

    totalEducationProfit: {
      type: Number,
      default: 0,
    },

    totalEpinProfit: {
      type: Number,
      default: 0,
    },

    totalWithdrawn: {
      type: Number,
      default: 0,
    },

    lastRevenueDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("CompanyWallet", companyWalletSchema);
