import User from "../models/User.js";
import AuthSession from "../models/AuthSession.js";
import { normalizePhone } from "../utils/normalizePhone.js";
import { verifyOTP } from "../services/otpService.js";

export const verifyEmail = async (req, res) => {
  return res.status(501).json({ message: "Email verification is not currently available." });
};

/**
 * Verify and Finalize Phone Number/Account Number Swap
 */
export const verifyPhoneUpdate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otp, newPhone } = req.body;

    if (!otp || !newPhone) {
      return res.status(400).json({ message: "OTP and new phone number are required parameters." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const cleanPhone = normalizePhone(newPhone);
    if (
      user.phoneOTPPurpose !== "phone_update" ||
      !user.phoneOTP ||
      !user.phoneOTPExpires ||
      user.phoneOTPExpires <= Date.now() ||
      !(await verifyOTP(otp.trim(), user.phoneOTP))
    ) {
      return res.status(400).json({ message: "Invalid or expired verification token." });
    }

    const phoneExists = await User.findOne({ phone: cleanPhone });
    if (phoneExists && phoneExists._id.toString() !== userId) {
      return res.status(400).json({ message: "This phone number is already bound to another active bank node." });
    }

    await AuthSession.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokeReason: "phone_update" } }
    );
    const updatedUser = await User.findOneAndUpdate({
      _id: userId,
      phoneOTP: user.phoneOTP,
      phoneOTPPurpose: "phone_update",
      phoneOTPExpires: { $gt: new Date() },
    }, {
      $set: {
        phone: cleanPhone,
        phoneVerified: true,
        phoneOTP: null,
        phoneOTPExpires: null,
        phoneOTPPurpose: null,
      },
      $inc: { authTokenVersion: 1 },
    }, { new: true });
    if (!updatedUser) return res.status(400).json({ message: "Invalid or expired verification token." });

    return res.json({
      success: true,
      message: "Account number swapped successfully! Your new login identity is active.",
      phone: updatedUser.phone,
      accountNumber: updatedUser.phone
    });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "This phone number is already in use." });
    }
    res.status(500).json({ message: err.message });
  }
};
