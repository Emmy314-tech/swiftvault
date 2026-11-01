import User from "../models/User.js";
import bcrypt from "bcryptjs";
import { revokeUserSessions } from "../services/authSessionService.js";
import { normalizePhone } from "../utils/normalizePhone.js";
import { sendSMS } from "../services/smsService.js";
import { generateOTP, hashOTP, verifyOTP } from "../services/otpService.js";
import SecurityAuditEvent from "../models/SecurityAuditEvent.js";
import { sendSecurityNotification } from "../services/securityService.js";

const resetRequestMessage = "If an account exists for that number, a recovery code will be sent if SMS delivery is available.";

export const requestReset = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ message: "Phone number/Account number is required to locate your node." });
    }

    const cleanPhone = normalizePhone(phone);
    const user = await User.findOne({ phone: cleanPhone });

    if (!user || !user.phoneVerified) return res.json({ success: true, message: resetRequestMessage });

    const recoveryOtp = generateOTP();

    user.phoneOTP = await hashOTP(recoveryOtp);
    user.phoneOTPExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.phoneOTPPurpose = "password_reset";
    await user.save();

    await sendSMS(user.phone, `Your SwiftVault password recovery OTP code is ${recoveryOtp}. It expires in 10 minutes. Do not share this pin with anyone.`);

    return res.json({
      success: true,
      message: resetRequestMessage,
    });

  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { phone, otp, newPassword } = req.body;

    if (!phone || !otp || !newPassword) {
      return res.status(400).json({ message: "Account number, verification OTP, and new password string are all required parameters." });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters." });
    }

    const cleanPhone = normalizePhone(phone);
    const user = await User.findOne({ phone: cleanPhone });

    if (
      !user ||
      user.phoneOTPPurpose !== "password_reset" ||
      !user.phoneOTP ||
      !user.phoneOTPExpires ||
      user.phoneOTPExpires <= Date.now() ||
      !(await verifyOTP(otp.trim(), user.phoneOTP))
    ) {
      return res.status(400).json({ message: "Invalid or expired recovery verification token code." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await revokeUserSessions(user._id, "password_reset");

    const updatedUser = await User.findOneAndUpdate({
      _id: user._id,
      phoneOTP: user.phoneOTP,
      phoneOTPPurpose: "password_reset",
      phoneOTPExpires: { $gt: new Date() },
    }, {
      $set: {
        password: passwordHash,
        phoneOTP: null,
        phoneOTPExpires: null,
        phoneOTPPurpose: null,
        securityCooldownUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      $inc: { authTokenVersion: 1 },
    }, { new: true });
    if (!updatedUser) {
      return res.status(400).json({ message: "Invalid or expired recovery verification token code." });
    }

    await SecurityAuditEvent.create({
      userId: updatedUser._id,
      eventType: "password_recovered",
      details: "Password recovery completed; 24-hour outgoing transaction cooldown applied.",
      ipAddress: req.ip || "Unknown",
      userAgent: String(req.headers?.["user-agent"] || "Unknown").slice(0, 500),
    });
    await sendSecurityNotification(
      updatedUser._id,
      "Your SwiftVault password was reset. Outgoing transactions are restricted for 24 hours. If you did not make this change, contact support immediately."
    );

    return res.json({
      success: true,
      message: "Password updated successfully. You can now log into your SwiftVault account."
    });

  } catch (err) {
    console.error("Password reset failed:", err.code || err.name || "unclassified_error");
    return res.status(500).json({ message: "Password reset could not be completed. Please try again." });
  }
};
