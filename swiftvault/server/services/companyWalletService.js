import CompanyWallet from "../models/CompanyWallet.js";

const getWallet = async (session = null) => {
  let wallet = session
    ? await CompanyWallet.findOne().session(session)
    : await CompanyWallet.findOne();

  if (!wallet) {
    const created = session
      ? await CompanyWallet.create(
          [{ name: "SwiftVault Revenue Wallet" }],
          { session }
        )
      : await CompanyWallet.create([{ name: "SwiftVault Revenue Wallet" }]);

    wallet = created[0];
  }

  return wallet;
};

export const getCompanyWallet = async (session = null) => getWallet(session);

export const withdrawFunds = async (
  amount,
  session = null
) => {
  const wallet = await getWallet(session);

  if (amount > wallet.balance) {
    throw new Error("Insufficient company wallet balance for this withdrawal");
  }

  wallet.balance -= amount;
  wallet.totalWithdrawn += amount;

  return session
    ? wallet.save({ session })
    : wallet.save();
};

export const refundWithdrawal = async (amount, session = null) => {
  const wallet = await getWallet(session);
  wallet.balance += amount;
  wallet.totalWithdrawn = Math.max(0, wallet.totalWithdrawn - amount);
  return session ? wallet.save({ session }) : wallet.save();
};

export const addUpgradeRevenue = async (
  amount,
  session = null
) => {
  const wallet = await getWallet(session);

  wallet.balance += amount;
  wallet.totalRevenue += amount;
  wallet.totalUpgradeRevenue += amount;
  wallet.lastRevenueDate = new Date();

  return session
    ? wallet.save({ session })
    : wallet.save();
};

export const addTransferFee = async (
  fee,
  session = null
) => {
  const wallet = await getWallet(session);

  wallet.balance += fee;
  wallet.totalRevenue += fee;
  wallet.totalTransferFees += fee;
  wallet.lastRevenueDate = new Date();

  return session
    ? wallet.save({ session })
    : wallet.save();
};

export const addVTUProfit = async (
  profit,
  session = null
) => {
  const wallet = await getWallet(session);

  wallet.balance += profit;
  wallet.totalRevenue += profit;
  wallet.totalVTUProfit += profit;
  wallet.lastRevenueDate = new Date();

  return session
    ? wallet.save({ session })
    : wallet.save();
};

export const addCableProfit = async (
  profit,
  session = null
) => {
  const wallet = await getWallet(session);

  wallet.balance += profit;
  wallet.totalRevenue += profit;
  wallet.totalCableProfit += profit;
  wallet.lastRevenueDate = new Date();

  return session
    ? wallet.save({ session })
    : wallet.save();
};

export const addElectricityProfit = async (
  profit,
  session = null
) => {
  const wallet = await getWallet(session);

  wallet.balance += profit;
  wallet.totalRevenue += profit;
  wallet.totalElectricityProfit += profit;
  wallet.lastRevenueDate = new Date();

  return session
    ? wallet.save({ session })
    : wallet.save();
};

export const addEducationProfit = async (
  profit,
  session = null
) => {
  const wallet = await getWallet(session);

  wallet.balance += profit;
  wallet.totalRevenue += profit;
  wallet.totalEducationProfit += profit;
  wallet.lastRevenueDate = new Date();

  return session
    ? wallet.save({ session })
    : wallet.save();
};

export const addEpinProfit = async (
  profit,
  session = null
) => {
  const wallet = await getWallet(session);

  wallet.balance += profit;
  wallet.totalRevenue += profit;
  wallet.totalEpinProfit += profit;
  wallet.lastRevenueDate = new Date();

  return session
    ? wallet.save({ session })
    : wallet.save();
};
