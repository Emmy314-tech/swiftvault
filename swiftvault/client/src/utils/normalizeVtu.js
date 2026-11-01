// Peyflex list endpoints (networks/providers/plans) are proxied through our backend
// as-is, so exact field names can vary by service. This normalizes common patterns
// instead of assuming one fixed shape.
export function normalizeItem(item) {
  if (typeof item === "string") return { label: item, value: item, price: null };

  const label =
    item.label || item.name || item.network || item.provider || item.plan_name || String(item.code || item.id || "");
  const value = item.value ?? item.plan_code ?? item.code ?? item.id ?? item.identifier ?? item.network ?? item.provider ?? label;
  const price = item.raw
    ? item.price ?? null
    : item.pricingStatus && item.pricingStatus !== "available"
      ? null
      : item.sellingPrice ?? null;

  return { label, value, price, raw: item };
}

export function extractList(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.plans)) return response.plans;
  if (Array.isArray(response?.networks)) return response.networks;
  if (Array.isArray(response?.providers)) return response.providers;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.options)) return response.options;
  return [];
}
