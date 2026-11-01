import axios from "axios";
import { normalizePhone } from "../utils/normalizePhone.js";
import { getCredential } from "./settingsService.js";

/**
 * Termii SMS dispatcher - the platform's real SMS provider (already used by the
 * password-reset flow). Credentials resolve from the admin Business Control
 * Center first, falling back to TERMII_API_KEY in .env.
 *
 * Delivery failures always return false. Development does not simulate SMS
 * delivery, and OTP contents or recipient numbers are never logged.
 */
export async function sendSMS(phoneNumber, message) {
  try {
    const formattedPhone = normalizePhone(phoneNumber);
    const apiKey = await getCredential("termiiApiKey");

    if (!apiKey) {
      console.error("[SMS] Termii API key is not configured.");
      return false;
    }

    const response = await axios.post("https://api.ng.termii.com/api/sms/number/send", {
      api_key: apiKey,
      to: formattedPhone,
      sms: message,
      from: process.env.TERMII_SENDER_ID || "SwiftTalk",
      channel: "generic",
    });
    return String(response.data?.code || "").toLowerCase() === "ok" &&
      typeof response.data?.message_id === "string" &&
      response.data.message_id.length > 0;
  } catch (error) {
    console.error("[SMS] Termii delivery failed:", error?.response?.status || error?.code || error?.name || "unclassified_error");
    return false;
  }
}
