import User from "../models/User.js";
import bcrypt from "bcryptjs";
import {
  authenticateAdminPin,
  authenticateTransactionPin,
  isFourDigitPin,
} from "../services/pinService.js";

export const setPin = async (req, res) => {
  try {
    const { pin, currentPin } = req.body ?? {};

    if (!isFourDigitPin(pin)) {
      return res.status(400).json({ message: "PIN must be 4 digits" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User account not found" });
    }

    if (user.pin) {
      const authentication = await authenticateTransactionPin(user, currentPin);
      if (!authentication.ok) {
        return res.status(authentication.status).json({ message: authentication.message });
      }
    }

    user.pin = await bcrypt.hash(pin, 10);
    user.pinAttempts = 0;
    user.pinLockedUntil = null;

    await user.save();

    res.json({ message: "PIN set successfully" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const setAdminPin = async (req, res) => {
  try {
    const { pin, currentPin } = req.body ?? {};

    if (!isFourDigitPin(pin)) {
      return res.status(400).json({ message: "Admin PIN must be 4 digits" });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only administrators can set an Admin PIN" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User account not found" });
    }

    if (user.adminPin) {
      const authentication = await authenticateAdminPin(user, currentPin);
      if (!authentication.ok) {
        return res.status(authentication.status).json({ message: authentication.message });
      }
    }

    user.adminPin = await bcrypt.hash(pin, 10);
    user.adminPinAttempts = 0;
    user.adminPinLockedUntil = null;

    await user.save();

    res.json({ message: "Admin PIN set successfully" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
