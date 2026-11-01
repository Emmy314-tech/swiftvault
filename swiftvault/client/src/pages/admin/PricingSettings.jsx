import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import { SkeletonCard } from "../../components/ui/Skeleton.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getBusinessSettings, updatePricing } from "../../services/adminService.js";

const FLAT_MARKUPS = [
  { key: "data", label: "Data (flat markup, ₦)" },
  { key: "cable", label: "Cable TV (flat markup, ₦)" },
  { key: "electricity", label: "Electricity (flat markup, ₦)" },
  { key: "educational", label: "Education (flat markup, ₦)" },
];

export default function PricingSettings() {
  const toast = useToast();
  const [pricing, setPricing] = useState(null);
  const [peyflexPricing, setPeyflexPricing] = useState(null);
  const [costEntriesText, setCostEntriesText] = useState("[]");
  const [providerCostPreviews, setProviderCostPreviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState("");

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getBusinessSettings();
      setPricing(data.settings.pricing);
      const providerConfig = data.settings.peyflexPricing || {
        providerEntitlement: { status: "unknown", evidenceReference: "", verifiedAt: null },
        costEntries: [],
      };
      setPeyflexPricing(providerConfig);
      setCostEntriesText(JSON.stringify(
        (providerConfig.costEntries || []).map((entry) =>
          Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "updatedAt"))
        ),
        null,
        2
      ));
      setProviderCostPreviews(data.providerCostPreviews || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateNormalValue = (service, key, value) => {
    setPricing((previous) => ({
      ...previous,
      [service]: service === "epin"
        ? { ...previous.epin, [key]: Number(value) }
        : { ...previous[service], [key]: Number(value) },
    }));
  };
  const updateUpgradedValue = (key, value) => {
    setPricing((previous) => ({
      ...previous,
      upgraded: { ...previous.upgraded, [key]: key === "enabled" ? value : Number(value) },
    }));
  };

  const handleSave = async (adminPin) => {
    setSaving(true);
    setPinError("");
    try {
      let costEntries;
      try {
        costEntries = JSON.parse(costEntriesText);
      } catch {
        throw new Error("Provider cost entries must be valid JSON.");
      }
      const payload = {
        data: { normal: pricing.data.normal },
        airtime: { normal: pricing.airtime.normal },
        cable: { normal: pricing.cable.normal },
        electricity: { normal: pricing.electricity.normal },
        educational: { normal: pricing.educational.normal },
        epin: { normalMultiplier: pricing.epin.normalMultiplier },
        upgraded: {
          enabled: pricing.upgraded.enabled,
          data: pricing.upgraded.data,
          airtime: pricing.upgraded.airtime,
          cable: pricing.upgraded.cable,
          electricity: pricing.upgraded.electricity,
          educational: pricing.upgraded.educational,
          epinMultiplier: pricing.upgraded.epinMultiplier,
        },
      };
      await updatePricing({
        pricing: payload,
        peyflexPricing: {
          providerEntitlement: peyflexPricing.providerEntitlement,
          costEntries,
        },
        adminPin,
      });
      toast("Pricing updated", "success");
      setPinOpen(false);
      await load();
    } catch (err) {
      setPinError(err.response?.data?.message || "Failed to update pricing");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonCard />;
  if (error) return <ErrorState message="Could not load pricing settings." onRetry={load} />;

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/admin/business-control" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">VTU Pricing</h1>
      </div>

      <Card>
        <h2 className="mb-1 font-semibold text-text-primary dark:text-gray-100">Normal User pricing</h2>
        <p className="mb-4 text-xs text-text-secondary">These current normal-user values are used regardless of account tier.</p>
        <div className="space-y-4">
          {FLAT_MARKUPS.map(({ key, label }) => (
            <Input
              key={key}
              label={label}
              type="number"
              min={0}
              value={pricing[key].normal}
              onChange={(event) => updateNormalValue(key, "normal", event.target.value)}
            />
          ))}
          <Input
            label="Airtime multiplier (minimum 1.0 to protect provider cost)"
            type="number"
            min={1}
            step="0.001"
            value={pricing.airtime.normal}
            onChange={(event) => updateNormalValue("airtime", "normal", event.target.value)}
          />
          <Input
            label="ePIN fallback multiplier (fixed denominations retain existing prices)"
            type="number"
            min={1}
            step="0.001"
            value={pricing.epin.normalMultiplier}
            onChange={(event) => updateNormalValue("epin", "normalMultiplier", event.target.value)}
          />
        </div>
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-text-primary dark:text-gray-100">Upgraded User pricing</h2>
          <p className="mt-1 text-xs text-text-secondary">This schedule is inactive until saved and enabled. Tier alone never applies it. Prices below provider cost are rejected.</p>
        </div>
        <label className="mb-4 flex items-center gap-2 text-sm font-medium text-text-primary dark:text-gray-100">
          <input
            type="checkbox"
            checked={pricing.upgraded.enabled}
            onChange={(event) => updateUpgradedValue("enabled", event.target.checked)}
          />
          Enable Upgraded User pricing
        </label>
        <div className="space-y-4">
          {FLAT_MARKUPS.map(({ key, label }) => (
            <Input
              key={key}
              label={label}
              type="number"
              min={0}
              value={pricing.upgraded[key]}
              onChange={(event) => updateUpgradedValue(key, event.target.value)}
            />
          ))}
          <Input
            label="Airtime multiplier (minimum 1.0)"
            type="number"
            min={1}
            step="0.001"
            value={pricing.upgraded.airtime}
            onChange={(event) => updateUpgradedValue("airtime", event.target.value)}
          />
          <Input
            label="ePIN multiplier"
            type="number"
            min={1}
            step="0.001"
            value={pricing.upgraded.epinMultiplier}
            onChange={(event) => updateUpgradedValue("epinMultiplier", event.target.value)}
          />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-text-primary dark:text-gray-100">Peyflex account discount entitlement</h2>
        <p className="mb-4 text-xs text-text-secondary">
          This is separate from customer tier and SwiftVault Upgrade Status. Set a discount level only when verified against provider account evidence.
        </p>
        {peyflexPricing && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-text-primary dark:text-gray-100">
              Provider entitlement
              <select
                className="mt-1 block w-full rounded-lg border border-borderc bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
                value={peyflexPricing.providerEntitlement.status}
                onChange={(event) => setPeyflexPricing((previous) => ({
                  ...previous,
                  providerEntitlement: { ...previous.providerEntitlement, status: event.target.value },
                }))}
              >
                <option value="unknown">Unknown / unverified</option>
                <option value="standard_api_discount">Standard API discount verified</option>
                <option value="top_reseller">Top-reseller discount verified</option>
              </select>
            </label>
            <Input
              label="Provider evidence reference (never enter credentials)"
              value={peyflexPricing.providerEntitlement.evidenceReference || ""}
              onChange={(event) => setPeyflexPricing((previous) => ({
                ...previous,
                providerEntitlement: { ...previous.providerEntitlement, evidenceReference: event.target.value },
              }))}
            />
            <Input
              label="Entitlement verification date"
              type="date"
              value={peyflexPricing.providerEntitlement.verifiedAt
                ? new Date(peyflexPricing.providerEntitlement.verifiedAt).toISOString().slice(0, 10)
                : ""}
              onChange={(event) => setPeyflexPricing((previous) => ({
                ...previous,
                providerEntitlement: { ...previous.providerEntitlement, verifiedAt: event.target.value },
              }))}
            />
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-text-primary dark:text-gray-100">Admin-managed Peyflex costs</h2>
        <p className="mb-3 text-xs text-text-secondary">
          Provider cost/fee evidence is manually maintained until a documented cost API is available. Costs and margins shown here are estimates for pricing only, not final provider charges or realized profit. Purchases are blocked when an exact product cost is missing or expired. Dates are explicit validity limits; no provider-discount entitlement is inferred.
        </p>
        <p className="mb-2 text-xs text-text-secondary">
          Entry fields: service, provider, product, providerCost, providerFee, validUntil (ISO date), evidenceReference. Dynamic product keys: airtime face value; electricity plan:type:face-value; ePIN denomination; exam PIN uses product "pin".
        </p>
        <textarea
          aria-label="Peyflex provider cost entries JSON"
          className="min-h-64 w-full rounded-lg border border-borderc bg-white p-3 font-mono text-xs text-text-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          value={costEntriesText}
          onChange={(event) => setCostEntriesText(event.target.value)}
          spellCheck={false}
        />
        {providerCostPreviews.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-borderc text-text-secondary dark:border-gray-700">
                  <th className="p-2">Product</th><th className="p-2">Provider cost</th>
                  <th className="p-2">Fee</th><th className="p-2">Normal price / estimated margin</th>
                  <th className="p-2">Upgraded price / estimated margin</th><th className="p-2">Validity</th>
                </tr>
              </thead>
              <tbody>
                {providerCostPreviews.map((entry) => (
                  <tr key={`${entry.service}|${entry.provider}|${entry.product}`} className="border-b border-borderc dark:border-gray-700">
                    <td className="p-2">{entry.service} / {entry.provider} / {entry.product}</td>
                    <td className="p-2">₦{Number(entry.providerCost).toLocaleString()}</td>
                    <td className="p-2">₦{Number(entry.providerFee).toLocaleString()}</td>
                    <td className="p-2">₦{Number(entry.normalSellingPrice).toLocaleString()} / ₦{Number(entry.normalEstimatedGrossMargin).toLocaleString()}</td>
                    <td className="p-2">₦{Number(entry.upgradedSellingPrice).toLocaleString()} / ₦{Number(entry.upgradedEstimatedGrossMargin).toLocaleString()}</td>
                    <td className="p-2">{entry.stale ? "EXPIRED" : new Date(entry.validUntil).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">No Peyflex provider costs are configured.</p>
        )}
      </Card>

      <Button onClick={() => setPinOpen(true)}>Save Pricing</Button>

      <PinConfirmModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onConfirm={handleSave}
        loading={saving}
        error={pinError}
        title="Confirm with Admin PIN"
        subtitle="Validate and save Normal and Upgraded pricing schedules"
      />
    </div>
  );
}
