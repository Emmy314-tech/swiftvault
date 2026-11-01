import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { fetchEducationProviders, purchaseExamPin } from "../services/peyflexService.js";
import { authenticateTransactionPin } from "../services/pinService.js";
import { isDefinitivePeyflexFailure } from "../services/providerOutcome.js";
import { recordPendingVtuSale, refundPendingVtuPurchase } from "../services/vtuSettlement.js";
import { isPositiveInteger } from "../utils/financialValidation.js";
import { resolveManagedProviderPrice } from "../services/providerPricingService.js";
import { allocateWalletDebit } from "../services/walletService.js";

export const fetchExamProviders = async (req, res) => {
  try { res.json(await fetchEducationProviders()); }
  catch (err) { res.status(500).json({ message: err.message }); }
};

export const purchaseEducationPin = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user.id;
    const { provider, quantity, pin } = req.body;
    const pinQty = quantity === undefined ? 1 : Number(quantity);
    if (!provider || !isPositiveInteger(pinQty)) throw new Error("A provider and valid exam PIN quantity are required.");

    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    const pinCheck = await authenticateTransactionPin(user, pin, session);
    if (!pinCheck.ok) {
      if (session.inTransaction()) await session.commitTransaction();
      session.endSession();
      return res.status(pinCheck.status).json({ message: pinCheck.message });
    }

    const quote = await resolveManagedProviderPrice({
      service: "education",
      provider,
      product: "pin",
      units: pinQty,
      user,
    });
    const { sellingPrice: totalSellingPrice, providerCost, providerFee, pricingSnapshot } = quote;
    if (!isPositiveFiniteAmount(totalSellingPrice)) throw new Error("Invalid exam PIN selling price");

    const balanceBefore = user.walletBalance;
    const walletAllocation = allocateWalletDebit(user, totalSellingPrice);
    await user.save({ session });

    const tx = await Transaction.create([{
      userId,
      type: "exam_pin",
      amount: totalSellingPrice,
      providerCost,
      providerFee,
      pricingSnapshot,
      balanceBefore,
      walletAllocation,
      idempotencyKey: req.purchaseIdempotency.key,
      requestFingerprint: req.purchaseIdempotency.fingerprint,
      description: `Purchased ${pinQty}x ${provider.toUpperCase()} Exam PIN(s)`,
      status: "pending",
      reference: crypto.randomUUID(),
    }], { session });
    await recordPendingVtuSale(tx[0], session);

    await session.commitTransaction();
    session.endSession();

    try {
      // NOTE: the user's transaction PIN is NEVER sent to the provider - it is
      // only used locally by authenticateTransactionPin above.
      await purchaseExamPin({ provider, quantity: pinQty });
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
