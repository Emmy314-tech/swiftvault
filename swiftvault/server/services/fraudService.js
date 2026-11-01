export const checkFraud = async (user, amount) => {
  // Block flagged accounts
  if (user.isFlagged) {
    return {
      allowed: false,
      reason: "This account has been flagged for suspicious activity."
    };
  }

  // Maximum ₦500,000 per day
  if ((user.dailyTransferAmount || 0) + amount > 500000) {
    return {
      allowed: false,
      reason: "Daily transfer limit exceeded."
    };
  }

  // Single transfer limit
  if (amount > 200000) {
    return {
      allowed: false,
      reason: "Transfer exceeds the maximum allowed amount."
    };
  }

if ((user.rapidTransferCount || 0) >= 10) {
  user.isFlagged = true;
  user.flagReason = "Too many transfers in a short period.";
  await user.save();

  return {
    allowed: false,
    reason: "Account temporarily locked for suspicious transfer activity."
  };
}
  return {
    allowed: true
  };
};
