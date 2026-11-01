export const UPGRADE_FEE = 3000;
const REFERRER_ALLOCATION = 1500;

export const getUpgradeAllocation = (hasEligibleReferrer, fee = UPGRADE_FEE) => {
  if (!Number.isSafeInteger(fee) || fee < REFERRER_ALLOCATION) {
    throw new Error(`Upgrade fee must be a whole-number amount of at least ₦${REFERRER_ALLOCATION}.`);
  }
  return {
    company: hasEligibleReferrer ? fee - REFERRER_ALLOCATION : fee,
    referrer: hasEligibleReferrer ? REFERRER_ALLOCATION : 0,
  };
};

export const isEligibleUpgradeReferrer = (referrer) =>
  referrer?.isUpgraded === true;

export const changeUserTier = (user, tier) => {
  user.tier = tier;
};

export const activateUserUpgrade = (user, upgradedAt = new Date()) => {
  user.isUpgraded = true;
  user.upgradedAt = upgradedAt;
};
