import express from "express";
import { paystackWebhook } from "../controllers/paystackFundingController.js";

const router = express.Router();

router.post("/paystack", paystackWebhook);

export default router;
