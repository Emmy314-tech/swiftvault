import bcrypt from "bcryptjs";

const MAX_ATTEMPTS = 3;
const LOCK_DURATION_MS = 15 * 60 * 1000; // matches the existing transfer PIN lockout

export const verifyTransactionPin = async (
  enteredPin,
  savedPin
) => {
  return await bcrypt.compare(
    enteredPin,
    savedPin
  );
};

export const isFourDigitPin = (pin) =>
  typeof pin === "string" && /^\d{4}$/.test(pin);

export const authenticateAdminPin = async (admin, enteredPin) => {
  if (!admin.adminPin) {
    return {
      ok: false,
      status: 400,
      message: "You haven't set an Admin PIN yet. Set one before performing this action.",
    };
  }

  if (admin.adminPinLockedUntil && admin.adminPinLockedUntil > Date.now()) {
    return {
      ok: false,
      status: 403,
      message: "Admin PIN is locked due to too many failed attempts. Try again later.",
    };
  }

  const validPin = await bcrypt.compare(String(enteredPin ?? ""), admin.adminPin);

  if (!validPin) {
    admin.adminPinAttempts = (admin.adminPinAttempts || 0) + 1;
    if (admin.adminPinAttempts >= MAX_ATTEMPTS) {
      admin.adminPinLockedUntil = Date.now() + LOCK_DURATION_MS;
    }
    await admin.save();
    return { ok: false, status: 400, message: "Incorrect Admin PIN" };
  }

  if (admin.adminPinAttempts > 0) {
    admin.adminPinAttempts = 0;
    admin.adminPinLockedUntil = null;
    await admin.save();
  }

  return { ok: true };
};

/**
 * Shared transaction-PIN gate with lockout for state-changing endpoints
 * (VTU purchases, bank transfers). Previously only transfers tracked failed
 * attempts - the VTU endpoints called bcrypt.compare() directly, which both
 * threw a confusing error when no PIN was set and allowed unlimited
 * brute-forcing of the 4-digit PIN.
 *
 * On failure this persists the attempt counter/lockout via `session`, so the
 * caller MUST commit (not abort) the transaction before responding, otherwise
 * the counter would be rolled back and brute-forcing stays free.
 *
 * Returns { ok: true } or { ok: false, status, message }.
 */
export const authenticateTransactionPin = async (user, enteredPin, session = null) => {
  const saveOptions = session ? { session } : {};

  if (!user.pin) {
    return { ok: false, status: 400, message: "Please configure your transaction PIN first" };
  }

  if (user.pinLockedUntil && user.pinLockedUntil > Date.now()) {
    const waitMinutes = Math.ceil((user.pinLockedUntil - Date.now()) / 1000 / 60);
    return {
      ok: false,
      status: 403,
      message: `Transaction PIN is locked due to security limits. Try again in ${waitMinutes} minute(s).`,
    };
  }

  let validPin = false;
  try {
    validPin = await bcrypt.compare(String(enteredPin ?? ""), user.pin);
  } catch {
    validPin = false;
  }

  if (!validPin) {
    user.pinAttempts = (user.pinAttempts || 0) + 1;

    if (user.pinAttempts >= MAX_ATTEMPTS) {
      user.pinLockedUntil = Date.now() + LOCK_DURATION_MS;
      await user.save(saveOptions);
      return { ok: false, status: 403, message: "Incorrect PIN. Account locked for 15 minutes." };
    }

    await user.save(saveOptions);
    const remaining = MAX_ATTEMPTS - user.pinAttempts;
    return { ok: false, status: 400, message: `Incorrect PIN. ${remaining} attempt(s) remaining.` };
  }

  // Successful authentication - reset any stale counters so a previous partial
  // lockout can't leak into future legitimate purchases.
  if ((user.pinAttempts || 0) > 0 || user.pinLockedUntil) {
    user.pinAttempts = 0;
    user.pinLockedUntil = null;
    await user.save(saveOptions);
  }

  return { ok: true };
};
