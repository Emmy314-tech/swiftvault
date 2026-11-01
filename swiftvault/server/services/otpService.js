import crypto from "crypto";
import bcrypt from "bcryptjs";

export const generateOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

export const hashOTP = (otp) => bcrypt.hash(String(otp), 10);

export const verifyOTP = async (otp, storedOTP) => {
  if (!storedOTP) return false;
  if (/^\$2[aby]\$/.test(storedOTP)) {
    return bcrypt.compare(String(otp), storedOTP);
  }

  const provided = Buffer.from(String(otp));
  const stored = Buffer.from(storedOTP);
  return provided.length === stored.length && crypto.timingSafeEqual(provided, stored);
};
