import User from "../models/User.js";
import AuthSession from "../models/AuthSession.js";
import bcrypt from "bcryptjs";
import LoginHistory from "../models/LoginHistory.js";
import { sendSMS } from "../services/smsService.js";
import { generateOTP, hashOTP, verifyOTP } from "../services/otpService.js";
import { createAuthToken } from "../services/authSessionService.js";

const normalizePhone = (phone) => {
  let formatted = phone.trim().replace(/[^\d]/g, "")
  if (formatted.startsWith("234")) return formatted;
  if (formatted.startsWith("0")) formatted = "234" + formatted.slice(1);
  return formatted;
};

export const register = async (req, res) => {
  try {
    const { fullName, username, email, phone, password, pin, referralCode } = req.body;
    if (!phone || !username || !email || !password || !pin) {
      return res.status(400).json({ message: "All core onboarding parameters are required." });
    }

    // Server-side validation matching what the registration form enforces.
    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }
    if (!/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ message: "Transaction PIN must be exactly 4 digits." });
    }

    const cleanPhone = normalizePhone(phone);
    const cleanUsername = username.toLowerCase().trim();
    const cleanEmail = email.toLowerCase().trim();

    const exists = await User.findOne({
      $or: [
        { phone: cleanPhone },
        { email: cleanEmail },
        { username: cleanUsername }
      ]
    });

    if (exists) {
      return res.status(400).json({ message: "An account with this Phone, Email, or Username already exists." });
    }

    const otpCode = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedPin = await bcrypt.hash(pin, 10);
    const generatedReferralCode = cleanUsername + Math.floor(100 + Math.random() * 900);

    const user = await User.create({
      fullName, username: cleanUsername, email: cleanEmail, phone: cleanPhone,
      password: hashedPassword, pin: hashedPin, referralCode: generatedReferralCode,
      referredBy: referralCode ? referralCode.trim() : null,
      phoneVerified: false,
      phoneOTP: await hashOTP(otpCode),
      phoneOTPExpires: otpExpiry,
      phoneOTPPurpose: "phone_verification",
      walletBalance: 0
    });

    const smsSent = await sendSMS(
      user.phone,
      `Your SwiftVault verification code is ${otpCode}. It expires in 10 minutes.`
    );

    if (!smsSent) {
      // Honest failure - never claim an OTP was delivered when it wasn't.
      return res.status(200).json({
        success: true,
        otpSent: false,
        message: "Account created, but the verification SMS could not be sent. Tap 'Resend code' on the next screen to try again.",
        phone: user.phone,
      });
    }

    res.json({ success: true, message: "Registration step complete. OTP sent.", phone: user.phone });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Re-dispatch a verification OTP for an account that hasn't verified yet.
// Always answers the same way regardless of whether the account exists, so this
// endpoint can't be used to probe which phone numbers are registered.
export const resendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone number is required" });

    const cleanPhone = normalizePhone(phone);
    const user = await User.findOne({ phone: cleanPhone });

    if (!user || user.phoneVerified) {
      return res.json({
        success: true,
        message: "If an unverified account exists for this number, a new code has been sent.",
        phone: cleanPhone,
      });
    }

    const otpCode = generateOTP();
    user.phoneOTP = await hashOTP(otpCode);
    user.phoneOTPExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.phoneOTPPurpose = "phone_verification";
    await user.save();

    const smsSent = await sendSMS(
      user.phone,
      `Your SwiftVault verification code is ${otpCode}. It expires in 10 minutes.`
    );

    if (!smsSent) {
      return res.status(502).json({
        success: false,
        message: "We couldn't send the verification SMS right now. Please try again in a moment.",
      });
    }

    return res.json({
      success: true,
      message: "A new verification code has been sent.",
      phone: user.phone,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const verifyPhoneOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: "Phone and OTP are required" });

    const cleanPhone = normalizePhone(phone);
    const user = await User.findOne({ phone: cleanPhone });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.phoneVerified) return res.status(400).json({ message: "Already verified" });

    if (
      user.phoneOTPPurpose !== "phone_verification" ||
      !user.phoneOTP ||
      !user.phoneOTPExpires ||
      !(await verifyOTP(otp.trim(), user.phoneOTP)) ||
      new Date() >= user.phoneOTPExpires
    ) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const verifiedUser = await User.findOneAndUpdate({
      _id: user._id,
      phoneVerified: false,
      phoneOTP: user.phoneOTP,
      phoneOTPPurpose: "phone_verification",
      phoneOTPExpires: { $gt: new Date() },
    }, {
      $set: { phoneVerified: true, phoneOTP: null, phoneOTPExpires: null, phoneOTPPurpose: null },
    }, { new: true });
    if (!verifiedUser) return res.status(400).json({ message: "Invalid or expired OTP" });

    const token = await createAuthToken(verifiedUser, req);
    return res.json({
      success: true,
      message: "Phone verified. Wallet funding and welcome bonuses are unavailable until provider and compliance approval.",
      token,
      user: {
        fullName: verifiedUser.fullName,
        username: verifiedUser.username,
        phone: verifiedUser.phone,
        role: verifiedUser.role,
        tier: verifiedUser.tier,
        isUpgraded: verifiedUser.isUpgraded === true,
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ message: "Missing credentials" });

    const cleanIdentifier = identifier.trim();
    const user = await User.findOne({
      $or: [
        { username: cleanIdentifier.toLowerCase() },
        { email: cleanIdentifier.toLowerCase() },
        { phone: normalizePhone(cleanIdentifier) }
      ]
    });

    if (!user) return res.status(400).json({ message: "Invalid credentials" });
    if (user.isSuspended) return res.status(403).json({ message: "Your account has been suspended. Please contact support." });
    if (!user.phoneVerified) return res.status(403).json({ message: "Account inactive", phoneVerified: false });

    // Account lockout check - mirrors the existing PIN lockout pattern already used for transfers
    if (user.loginLockedUntil && user.loginLockedUntil > Date.now()) {
      const waitMinutes = Math.ceil((user.loginLockedUntil - Date.now()) / 1000 / 60);
      return res.status(423).json({
        message: `Account temporarily locked due to repeated failed login attempts. Try again in ${waitMinutes} minute(s).`,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;

      if (user.loginAttempts >= 5) {
        user.loginLockedUntil = Date.now() + 30 * 60 * 1000; // 30 minutes, per spec
        user.loginAttempts = 0;
        await user.save();

        await LoginHistory.create({
          userId: user._id, ipAddress: req.ip, userAgent: req.headers["user-agent"], success: false
        });

        return res.status(423).json({
          message: "Account locked for 30 minutes due to too many failed login attempts.",
        });
      }

      await user.save();

      await LoginHistory.create({
        userId: user._id, ipAddress: req.ip, userAgent: req.headers["user-agent"], success: false
      });
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Successful login - reset lockout counters
    if (user.loginAttempts > 0 || user.loginLockedUntil) {
      user.loginAttempts = 0;
      user.loginLockedUntil = null;
      await user.save();
    }

    await LoginHistory.create({
      userId: user._id, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      device: req.headers["user-agent"], platform: req.headers["user-agent"], success: true
    });

    const token = await createAuthToken(user, req);
    return res.json({
      success: true, message: "Access granted.", token,
      user: {
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tier: user.tier || "normal",
        isUpgraded: user.isUpgraded === true,
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const logout = async (req, res) => {
  try {
    const result = await AuthSession.updateOne({
      _id: req.authSession._id,
      userId: req.user._id,
      revokedAt: null,
    }, {
      $set: { revokedAt: new Date(), revokeReason: "logout" },
    });

    if (result.modifiedCount !== 1) {
      return res.status(401).json({ message: "Session is already invalid or expired." });
    }
    return res.json({ success: true, message: "Signed out successfully." });
  } catch (err) {
    console.error("Session logout failed:", err.code || err.name || "unclassified_error");
    return res.status(500).json({ message: "Could not securely end this session. Please retry." });
  }
};
