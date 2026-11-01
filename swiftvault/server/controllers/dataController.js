import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { getDataNetworks, getDataPlans, buyData } from "../services/peyflexService.js";
import { authenticateTransactionPin } from "../services/pinService.js";
import { isDefinitivePeyflexFailure } from "../services/providerOutcome.js";
import { recordPendingVtuSale, refundPendingVtuPurchase } from "../services/vtuSettlement.js";
import { isPositiveFiniteAmount } from "../utils/financialValidation.js";
import { previewManagedProviderPrice, resolveManagedProviderPrice } from "../services/providerPricingService.js";
import { allocateWalletDebit } from "../services/walletService.js";

export const fetchNetworks = async (req, res) => {
  try { res.json(await getDataNetworks()); } 
  catch (err) { res.status(500).json({ message: err.message }); }
};

export const fetchPlans = async (req, res) => {
  try {
    const { network } = req.query;
    if (!network) return res.status(400).json({ message: "Network is required" });
    const response = await getDataPlans(network);
    const plans = await Promise.all(
      (response?.plans || []).map(async (plan) => {
        const product = String(plan.plan_code ?? plan.code ?? plan.id ?? plan.identifier ?? "");
        const quote = await previewManagedProviderPrice({
          service: "data",
          provider: network,
          product,
          user: req.user,
        });
        return { ...plan, ...quote };
      })
    );
    return res.json({ status: "SUCCESS", network, plans });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

export const purchaseData = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user.id;
    const { network, plan_code, mobile_number, pin } = req.body;
    
    // 1. Fetch User & PIN Auth (tracks failed attempts + lockout)
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");
    const pinCheck = await authenticateTransactionPin(user, pin, session);
    if (!pinCheck.ok) {
      // Commit so the failed-attempt counter/lockout persists; nothing else
      // has been written to the ledger at this point.
      if (session.inTransaction()) await session.commitTransaction();
      session.endSession();
      return res.status(pinCheck.status).json({ message: pinCheck.message });
    }

    // 2. Validate Plan & Price
    const response = await getDataPlans(network);
    const selectedPlan = (response?.plans || []).find(
      (plan) => [plan.plan_code, plan.code, plan.id, plan.identifier].includes(plan_code)
    );
    if (!selectedPlan) throw new Error("Invalid plan selected");
    const quote = await resolveManagedProviderPrice({
      service: "data",
      provider: network,
      product: String(selectedPlan.plan_code ?? selectedPlan.code ?? selectedPlan.id ?? selectedPlan.identifier ?? ""),
      user,
    });
    const { sellingPrice, providerCost, providerFee, pricingSnapshot } = quote;
    if (!isPositiveFiniteAmount(sellingPrice)) throw new Error("Invalid data selling price");
    // 3. Atomic Deduction & Record
    const balanceBefore = user.walletBalance;
    const walletAllocation = allocateWalletDebit(user, sellingPrice);
    await user.save({ session });
    const tx = await Transaction.create([{
      userId,
      type: "data_purchase",
      amount: sellingPrice,
      providerCost,
      providerFee,
      pricingSnapshot,
      balanceBefore,
      walletAllocation,
      idempotencyKey: req.purchaseIdempotency.key,
      requestFingerprint: req.purchaseIdempotency.fingerprint,
      description: `Data: ${network} ${plan_code} to ${mobile_number}`,
      status: "pending",
      reference: crypto.randomUUID(),
    }], { session });
    await recordPendingVtuSale(tx[0], session);

    await session.commitTransaction();
    session.endSession();

    // 4. External Execution
    try {
      await buyData({ network, mobile_number, plan_code });
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
