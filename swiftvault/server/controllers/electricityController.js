import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { getElectricityPlans, verifyMeter, rechargeElectricity } from "../services/peyflexService.js";
import { authenticateTransactionPin } from "../services/pinService.js";
import { isDefinitivePeyflexFailure } from "../services/providerOutcome.js";
import { recordPendingVtuSale, refundPendingVtuPurchase } from "../services/vtuSettlement.js";
import { isPositiveFiniteAmount } from "../utils/financialValidation.js";
import { resolveManagedProviderPrice } from "../services/providerPricingService.js";
import { allocateWalletDebit } from "../services/walletService.js";

export const fetchElectricityPlans = async (req, res) => {
  try { res.json(await getElectricityPlans()); }
  catch (err) { res.status(500).json({ message: err.message }); }
};

export const verifyElectricityMeter = async (req, res) => {
  try {
    const { meter, plan, type } = req.body;
    res.json(await verifyMeter({ meter, plan, type }));
  } catch (err) { res.status(400).json({ message: "Verification failed", error: err.message }); }
};

export const purchaseElectricity = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user.id;
    const { plan, meter, type, amount, pin } = req.body;
    const fundingAmount = Number(amount);
    if (!isPositiveFiniteAmount(fundingAmount)) throw new Error("Invalid electricity amount");

    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    const pinCheck = await authenticateTransactionPin(user, pin, session);
    if (!pinCheck.ok) {
      if (session.inTransaction()) await session.commitTransaction();
      session.endSession();
      return res.status(pinCheck.status).json({ message: pinCheck.message });
    }

    if (!plan || !["prepaid", "postpaid"].includes(String(type).toLowerCase())) {
      throw new Error("A valid electricity plan and prepaid/postpaid type are required.");
    }
    const quote = await resolveManagedProviderPrice({
      service: "electricity",
      provider: "electricity",
      product: `${plan}:${String(type).toLowerCase()}:${fundingAmount}`,
      user,
    });
    const { sellingPrice, providerCost, providerFee, pricingSnapshot } = quote;
    if (!isPositiveFiniteAmount(sellingPrice)) throw new Error("Invalid electricity price");
    const balanceBefore = user.walletBalance;
    const walletAllocation = allocateWalletDebit(user, sellingPrice);
    await user.save({ session });

    const tx = await Transaction.create([{
      userId,
      type: "electricity",
      amount: sellingPrice,
      providerCost,
      providerFee,
      pricingSnapshot,
      balanceBefore,
      walletAllocation,
      idempotencyKey: req.purchaseIdempotency.key,
      requestFingerprint: req.purchaseIdempotency.fingerprint,
      description: `${plan.toUpperCase()} ${type.toUpperCase()} Meter Token (${meter})`,
      status: "pending",
      reference: crypto.randomUUID(),
    }], { session });
    await recordPendingVtuSale(tx[0], session);

    await session.commitTransaction();
    session.endSession();

    try {
      await rechargeElectricity({ plan, meter, type, amount: fundingAmount, phone: user.phone });
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
