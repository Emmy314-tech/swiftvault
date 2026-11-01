export const allocateWalletDebit = (user, amount) => {
  const rawAmount = Number(amount);
  const rawWalletBalance = Number(user.walletBalance || 0);
  const rawBonusBalance = Number(user.bonusBalance || 0);
  const amountCents = Math.round(rawAmount * 100);
  const walletCents = Math.round(rawWalletBalance * 100);
  const bonusCents = Math.round(rawBonusBalance * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 ||
    !Number.isSafeInteger(walletCents) || walletCents < 0 ||
    !Number.isSafeInteger(bonusCents) || bonusCents < 0 ||
    Math.abs(amountCents / 100 - rawAmount) > 0.000001 ||
    Math.abs(walletCents / 100 - rawWalletBalance) > 0.000001 ||
    Math.abs(bonusCents / 100 - rawBonusBalance) > 0.000001) {
    throw new Error("Wallet balances and purchase amount must be valid monetary values.");
  }
  if (walletCents + bonusCents < amountCents) {
    throw new Error("Insufficient balance.");
  }

  const walletDebit = Math.min(walletCents, amountCents);
  const bonusDebit = amountCents - walletDebit;
  user.walletBalance = (walletCents - walletDebit) / 100;
  user.bonusBalance = (bonusCents - bonusDebit) / 100;
  return { wallet: walletDebit / 100, bonus: bonusDebit / 100 };
};

const rejectUnjournaledWalletMutation = async () => {
  const error = new Error("Use a transactional, journaled financial operation for wallet mutations.");
  error.code = "JOURNALED_OPERATION_REQUIRED";
  throw error;
};

export const creditWallet = rejectUnjournaledWalletMutation;
export const debitWallet = rejectUnjournaledWalletMutation;
