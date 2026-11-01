import { useEffect, useState } from "react";
import { Cog, Info } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import Toggle from "../../components/ui/Toggle.jsx";
import { SkeletonCard } from "../../components/ui/Skeleton.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import PinConfirmModal from "../../components/wallet/PinConfirmModal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getBusinessSettings, updateSystemSettings } from "../../services/adminService.js";

export default function SystemSettings() {
  const toast = useToast();
  const [system, setSystem] = useState(null);
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
      setSystem(data.settings.system);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (adminPin) => {
    setSaving(true);
    setPinError("");
    try {
      await updateSystemSettings({ system, adminPin });
      toast("System settings updated", "success");
      setPinOpen(false);
    } catch (err) {
      setPinError(err.response?.data?.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonCard />;
  if (error) return <ErrorState message="Could not load system settings." onRetry={load} />;

  return (
    <div className="mx-auto max-w-lg space-y-5 animate-fade-in">
      <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">System Settings</h1>

      <Card className="flex gap-3 bg-info-light dark:bg-info/10">
        <Info size={18} className="mt-0.5 shrink-0 text-info" />
        <p className="text-sm text-text-secondary dark:text-gray-300">
          Logo and favicon are set by URL (paste a link to an already-hosted image) - this
          backend doesn't support direct file uploads.
        </p>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Cog size={17} className="text-primary-600" />
          <h3 className="font-semibold text-text-primary dark:text-gray-100">Site Identity</h3>
        </div>
        <div className="space-y-4">
          <Input label="Site Name" value={system.siteName} onChange={(e) => setSystem({ ...system, siteName: e.target.value })} />
          <Input label="Logo URL" placeholder="https://..." value={system.logoUrl} onChange={(e) => setSystem({ ...system, logoUrl: e.target.value })} />
          <Input label="Favicon URL" placeholder="https://..." value={system.faviconUrl} onChange={(e) => setSystem({ ...system, faviconUrl: e.target.value })} />
          <Input label="Support Email" value={system.supportEmail} onChange={(e) => setSystem({ ...system, supportEmail: e.target.value })} />
          <Input label="Support Phone" value={system.supportPhone} onChange={(e) => setSystem({ ...system, supportPhone: e.target.value })} />
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-text-primary dark:text-gray-100">SEO</h3>
        <div className="space-y-4">
          <Input label="SEO Title" value={system.seoTitle} onChange={(e) => setSystem({ ...system, seoTitle: e.target.value })} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">SEO Description</label>
            <textarea
              rows={3}
              value={system.seoDescription}
              onChange={(e) => setSystem({ ...system, seoDescription: e.target.value })}
              className="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
      </Card>

      <Card>
        <Toggle
          checked={system.maintenanceMode}
          onChange={(v) => setSystem({ ...system, maintenanceMode: v })}
          label="Maintenance Mode"
          description="Blocks normal user access site-wide; admins can still log in and manage the system"
        />
      </Card>

      <Button onClick={() => setPinOpen(true)}>Save System Settings</Button>

      <PinConfirmModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onConfirm={handleSave}
        loading={saving}
        error={pinError}
        title="Confirm with Admin PIN"
        subtitle="Confirm system settings changes with your Admin PIN"
      />
    </div>
  );
}
