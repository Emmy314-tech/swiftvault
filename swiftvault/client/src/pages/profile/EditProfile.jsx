import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import { SkeletonCard } from "../../components/ui/Skeleton.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getProfile, updateProfile } from "../../services/userService.js";

export default function EditProfile() {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", businessName: "" });

  useEffect(() => {
    getProfile()
      .then(({ data }) => setForm({ fullName: data.fullName || "", email: data.email || "", businessName: data.businessName || "" }))
      .catch(() => toast("Could not load profile", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile(form);
      toast("Profile updated successfully", "success");
      navigate("/profile");
    } catch (err) {
      toast(err.response?.data?.message || "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonCard />;

  return (
    <div className="mx-auto max-w-md space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/profile" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Edit Profile</h1>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Full Name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input
            label="Business Name (optional)"
            placeholder="Shown on receipts for Retail/Wholesale accounts"
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
          />
          <Button type="submit" loading={saving}>Save Changes</Button>
        </form>
      </Card>

      <p className="text-center text-xs text-text-secondary dark:text-gray-500">
        To change your phone number, please contact support - this isn't self-serve yet.
      </p>
    </div>
  );
}
