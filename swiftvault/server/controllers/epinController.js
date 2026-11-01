import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { fetchEpinOptions, purchaseEpin } from "../services/peyflexService.js";
import { authenticateTransactionPin } from "../services/pinService.js";
import { isDefinitivePeyflexFailure } from "../services/providerOutcome.js";
import { recordPendingVtuSale, refundPendingVtuPurchase } from "../services/vtuSettlement.js";
import { isPositiveFiniteAmount, isPositiveInteger } from "../utils/financialValidation.js";
import { resolveManagedProviderPrice } from "../services/providerPricingService.js";
import { allocateWalletDebit } from "../services/walletService.js";

export const fetchEpinNetworks = async (req, res) => {
  try { res.json(await fetchEpinOptions()); }
  catch (err) { res.status(500).json({ message: err.message }); }
};

export const purchaseEpinCards = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user.id;
    const { network, amount, quantity, pin } = req.body;
    const faceValue = Number(amount);
    const cardQty = quantity === undefined ? 1 : Number(quantity);
    if (!isPositiveFiniteAmount(faceValue) || !isPositiveInteger(cardQty)) throw new Error("Invalid ePIN amount or quantity");

    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    const pinCheck = await authenticateTransactionPin(user, pin, session);
    if (!pinCheck.ok) {
      if (session.inTransaction()) await session.commitTransaction();
      session.endSession();
      return res.status(pinCheck.status).json({ message: pinCheck.message });
    }

    const quote = await resolveManagedProviderPrice({
      service: "epin",
      provider: network,
      product: String(faceValue),
      units: cardQty,
      user,
    });
    const { sellingPrice: totalSellingPrice, providerCost, providerFee, pricingSnapshot } = quote;
    if (!isPositiveFiniteAmount(totalSellingPrice)) throw new Error("Invalid ePIN selling price");

    const balanceBefore = user.walletBalance;
    const walletAllocation = allocateWalletDebit(user, totalSellingPrice);
    await user.save({ session });

    const tx = await Transaction.create([{
      userId,
      type: "epin",
      amount: totalSellingPrice,
      providerCost,
      providerFee,
      pricingSnapshot,
      balanceBefore,
      walletAllocation,
      idempotencyKey: req.purchaseIdempotency.key,
      requestFingerprint: req.purchaseIdempotency.fingerprint,
      description: `Generated ${cardQty}x ${network.toUpperCase()} ₦${faceValue} Recharge Card PIN(s)`,
      status: "pending",
      reference: crypto.randomUUID(),
    }], { session });
    await recordPendingVtuSale(tx[0], session);

    await session.commitTransaction();
    session.endSession();

    try {
      await purchaseEpin({ network, amount: faceValue, quantity: cardQty });
      return res.status(202).json({ success: false, status: "pending", reference: tx[0].reference, message: "Peyflex has no verified purchase-response contract. Funds remain held pending provider reconciliation; do not retry." });
    } catch (err) {
      if (!isDefinitivePeyflexFailure(err)) {
        return res.status(202).json({ success: false, status: "pending", reference: tx[0].reference, message: "Purchase status is pending provider confirmation. Do not retry yet." });
      }
      await refundPendingVtuPurchase(tx[0]._id, userId);
      res.status(422).json({ message: "Transaction failed, wallet refunded." });
    }
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: err.message });
  }
};
