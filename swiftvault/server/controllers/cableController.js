import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { getCableProviders, getCablePlans, verifyCable, rechargeCable } from "../services/peyflexService.js";
import { authenticateTransactionPin } from "../services/pinService.js";
import { isDefinitivePeyflexFailure } from "../services/providerOutcome.js";
import { recordPendingVtuSale, refundPendingVtuPurchase } from "../services/vtuSettlement.js";
import { isPositiveFiniteAmount } from "../utils/financialValidation.js";
import { previewManagedProviderPrice, resolveManagedProviderPrice } from "../services/providerPricingService.js";
import { allocateWalletDebit } from "../services/walletService.js";

export const fetchCableProviders = async (req, res) => {
  try { res.json(await getCableProviders()); }
  catch (err) { res.status(500).json({ message: err.message }); }
};

export const fetchCablePlans = async (req, res) => {
  try {
    const { provider } = req.query;
    if (!provider) return res.status(400).json({ message: "Provider is required" });
    const response = await getCablePlans(provider);
    const plans = await Promise.all(
      (response?.plans || response || []).map(async (plan) => {
        const product = String(plan.plan_code ?? plan.code ?? plan.id ?? plan.identifier ?? "");
        const quote = await previewManagedProviderPrice({
          service: "cable",
          provider,
          product,
          user: req.user,
        });
        return { ...plan, ...quote };
      })
    );
    res.json({ status: "SUCCESS", provider, plans });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

export const verifyCableDecoder = async (req, res) => {
  try {
    const { provider, smart_card_number } = req.body;
    if (!provider || !smart_card_number) {
      return res.status(400).json({ message: "Cable provider and smart card/IUC number are required." });
    }
    res.json(await verifyCable({ identifier: provider, iuc: smart_card_number }));
  } catch (err) { res.status(400).json({ message: "Verification failed", error: err.message }); }
};

export const purchaseCable = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user.id;
    const { provider, smart_card_number, plan_code, pin } = req.body;
    if (!provider || !smart_card_number || !plan_code) {
      throw new Error("Cable provider, smart card/IUC number, and plan are required.");
    }

    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    const pinCheck = await authenticateTransactionPin(user, pin, session);
    if (!pinCheck.ok) {
      if (session.inTransaction()) await session.commitTransaction();
      session.endSession();
      return res.status(pinCheck.status).json({ message: pinCheck.message });
    }

    const response = await getCablePlans(provider);
    const plans = response?.plans || response || [];
    const selectedPlan = plans.find(
      (plan) => [plan.plan_code, plan.code, plan.id, plan.identifier].includes(plan_code)
    );
    if (!selectedPlan) throw new Error("Invalid cable plan selected");

    const product = String(selectedPlan.plan_code ?? selectedPlan.code ?? selectedPlan.id ?? selectedPlan.identifier ?? "");
    const quote = await resolveManagedProviderPrice({
      service: "cable",
      provider,
      product,
      user,
    });
    const { sellingPrice, providerCost, providerFee, pricingSnapshot } = quote;
    if (!isPositiveFiniteAmount(sellingPrice)) throw new Error("Invalid cable plan price");
    const balanceBefore = user.walletBalance;
    const walletAllocation = allocateWalletDebit(user, sellingPrice);
    await user.save({ session });
    
    const tx = await Transaction.create([{
      userId,
      type: "cable_tv",
      amount: sellingPrice,
      providerCost,
      providerFee,
      pricingSnapshot,
      balanceBefore,
      walletAllocation,
      idempotencyKey: req.purchaseIdempotency.key,
      requestFingerprint: req.purchaseIdempotency.fingerprint,
      description: `${provider.toUpperCase()} ${selectedPlan.label || plan_code} to ${smart_card_number}`,
      status: "pending",
      reference: crypto.randomUUID(),
    }], { session });
    await recordPendingVtuSale(tx[0], session);

    await session.commitTransaction();
    session.endSession();

    try {
      await rechargeCable({
        identifier: provider,
        plan: product,
        iuc: smart_card_number,
        phone: user.phone,
        ...(Number.isFinite(Number(selectedPlan.amount)) && Number(selectedPlan.amount) > 0
          ? { amount: Number(selectedPlan.amount) }
          : {}),
      });
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
