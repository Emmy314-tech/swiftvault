import crypto from "crypto";

// AES-256-GCM encryption for API credentials stored in the Settings collection.
// Requires SETTINGS_ENCRYPTION_KEY in .env - a 32-byte key, typically generated once with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// and used as a 64-character hex string.

function getKey() {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw || raw.length !== 64) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY is missing or invalid in .env - must be a 64-character hex string (32 bytes). " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(raw, "hex");
}

export function encrypt(plainText) {
  if (!plainText) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store iv + authTag + ciphertext together, all hex-encoded, colon-separated
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(cipherText) {
  if (!cipherText) return "";
  const [ivHex, authTagHex, dataHex] = cipherText.split(":");
  if (!ivHex || !authTagHex || !dataHex) return "";

  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// Masks a secret for safe display in admin UI - shows only the last 4 characters
export function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 4) return "****";
  return `${"*".repeat(value.length - 4)}${value.slice(-4)}`;
}
