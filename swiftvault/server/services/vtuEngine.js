import { buyData } from "./peyflexService.js";
import { debitWallet, creditWallet } from "./walletService.js";
import Transaction from "../models/Transaction.js";
import crypto from "crypto";

export const processDataPurchase = async (user, payload) => {
  const { network, mobile_number, plan_code, amount } = payload;

  // 1. create transaction reference
  const reference = crypto.randomUUID();

  // 2. debit wallet first (HOLD MONEY)
  await debitWallet(
    user._id,
    amount,
    "data_purchase",
    `VTU debit for ${network}`
  );

  // 3. log pending transaction
  const tx = await Transaction.create({
    userId: user._id,
    reference,
    type: "data_purchase",
    amount,
    status: "pending",
    description: `Buying ${plan_code} for ${mobile_number}`
  });

  try {
    // 4. call peyflex
    const response = await buyData({
      network,
      mobile_number,
      plan_code
    });

    // 5. success → update transaction
    tx.status = "success";
    tx.provider_response = response;
    await tx.save();

    return response;

  } catch (err) {
    // 6. FAIL → refund user automatically
    await creditWallet(
      user._id,
      amount,
      "refund",
      "Refund for failed VTU transaction"
    );

    tx.status = "failed";
    tx.provider_response = err.response?.data || err.message;
    await tx.save();

    throw new Error("VTU failed, amount refunded");
  }
};
