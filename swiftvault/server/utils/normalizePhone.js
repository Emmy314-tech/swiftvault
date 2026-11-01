/**
 * Normalizes input phone parameters to standard 234 format string indices
 */
export const normalizePhone = (phone) => {
  if (!phone) return "";
  let formatted = phone.trim().replace(/[\s\-\+]/g, "");
  if (formatted.startsWith("234")) {
    return formatted;
  }
  if (formatted.startsWith("0")) {
    formatted = "234" + formatted.slice(1);
  }
  return formatted;
};
