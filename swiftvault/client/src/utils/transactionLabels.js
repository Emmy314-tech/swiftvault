export const CREDIT_TYPES = ["welcome_bonus", "referral_bonus", "referral_upgrade_bonus", "wallet_funding", "wallet_received", "refund"];

export const STATUS_VARIANT = { success: "success", pending: "warning", failed: "error" };

export const TYPE_LABEL = {
  welcome_bonus: "Welcome Bonus",
  referral_bonus: "Referral Bonus",
  referral_upgrade_bonus: "Referral Commission",
  wallet_funding: "Wallet Funding",
  wallet_transfer: "Wallet Transfer",
  transfer: "Transfer",
  wallet_received: "Money Received",
  withdrawal: "Withdrawal",
  airtime: "Airtime",
  data_purchase: "Data Purchase",
  epin: "Recharge Card",
  electricity: "Electricity",
  cable_tv: "Cable TV",
  exam_pin: "Exam PIN",
  upgrade: "Account Upgrade",
  refund: "Refund",
};

export const ALL_TYPES = Object.keys(TYPE_LABEL);
