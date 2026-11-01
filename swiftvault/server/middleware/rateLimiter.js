import rateLimit from "express-rate-limit";

// IP-based limiter, separate from the per-account lockout in authController.js.
// This stops one IP from hammering the login endpoint with requests across many
// different accounts; the per-account lockout below stops repeated guesses
// against one specific account. Both layers are needed - neither replaces the other.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts from this device. Please try again in a few minutes." },
});

// Registration creates an account AND dispatches a paid SMS - throttle hard per IP
// to prevent mass-account creation and SMS-cost abuse.
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts from this device. Please try again later." },
});

// OTP verification / resend / password-reset endpoints all accept 6-digit codes.
// Without this limiter those codes could be brute-forced. Kept separate from the
// login limiter so legitimate login traffic can't exhaust the OTP budget (and
// vice versa).
export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 OTP attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification attempts from this device. Please wait a few minutes and try again." },
});

export const kycRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification requests from this device. Please try again later." },
});

export const supportRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many support updates from this device. Please try again later." },
});

export const securityRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many security verification attempts. Please wait and try again." },
});

export const walletFundingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many wallet-funding requests. Please try again later." },
});

export const financialMutationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many financial requests. Please try again later." },
});
