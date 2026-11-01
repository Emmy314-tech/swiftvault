import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { getAirtimeNetworks, buyAirtime } from "../services/peyflexService.js";
import { authenticateTransactionPin } from "../services/pinService.js";
import { isDefinitivePeyflexFailure } from "../services/providerOutcome.js";
import { recordPendingVtuSale, refundPendingVtuPurchase } from "../services/vtuSettlement.js";
import { isPositiveFiniteAmount } from "../utils/financialValidation.js";
import { resolveManagedProviderPrice } from "../services/providerPricingService.js";
import { allocateWalletDebit } from "../services/walletService.js";

export const fetchAirtimeNetworks = async (req, res) => {
  try { res.json(await getAirtimeNetworks()); }
  catch (err) { res.status(500).json({ message: err.message }); }
};

export const purchaseAirtime = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user.id;
    const { network, mobile_number, amount, pin } = req.body;
    const faceValue = Number(amount);
    if (!isPositiveFiniteAmount(faceValue)) throw new Error("Invalid airtime amount");

    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    const pinCheck = await authenticateTransactionPin(user, pin, session);
    if (!pinCheck.ok) {
      if (session.inTransaction()) await session.commitTransaction();
      session.endSession();
      return res.status(pinCheck.status).json({ message: pinCheck.message });
    }

    const quote = await resolveManagedProviderPrice({
      service: "airtime",
      provider: network,
      product: String(faceValue),
      user,
    });
    const { sellingPrice, providerCost, providerFee, pricingSnapshot } = quote;
    if (!isPositiveFiniteAmount(sellingPrice)) throw new Error("Invalid airtime price");
    const balanceBefore = user.walletBalance;
    const walletAllocation = allocateWalletDebit(user, sellingPrice);
    await user.save({ session });

    const tx = await Transaction.create([{
      userId,
      type: "airtime",
      amount: sellingPrice,
      providerCost,
      providerFee,
      pricingSnapshot,
      balanceBefore,
      walletAllocation,
      idempotencyKey: req.purchaseIdempotency.key,
      requestFingerprint: req.purchaseIdempotency.fingerprint,
      description: `${network.toUpperCase()} Airtime ₦${faceValue} to ${mobile_number}`,
      status: "pending",
      reference: crypto.randomUUID(),
    }], { session });
    await recordPendingVtuSale(tx[0], session);

    await session.commitTransaction();
    session.endSession();

    try {
      await buyAirtime({ network, mobile_number, amount: faceValue });
      return res.status(202).json({ success: false, status: "pending", reference: tx[0].reference, message: "Peyflex has no verified purchase-response contract. Funds remain held pending provider reconciliation; do not retry." });
    } catch (err) {
      if (!isDefinitivePeyflexFailure(err)) {
        return res.status(202).json({ success: false, status: "pending", reference: tx[0].reference, message: "Purchase status is pending provider confirmation. Do not retry yet." });
      }
      await refundPendingVtuPurchase(tx[0]._id, userId);
      return res.status(422).json({ message: "Transaction failed, wallet refunded." });
    }
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    return res.status(400).json({ message: err.message });
  }
};
