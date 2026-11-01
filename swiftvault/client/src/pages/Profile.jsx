import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  User, Edit2, Lock, ShieldCheck, Smartphone, LogOut, ChevronRight, Gift,
  Settings as SettingsIcon, Crown,
  LifeBuoy,
} from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import { SkeletonCard } from "../components/ui/Skeleton.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { claimWelcomeBonus, getProfile } from "../services/userService.js";
import { getKycOverview } from "../services/kycService.js";

const TIER_LABEL = { normal: "Normal", retail: "Retail", wholesale: "Wholesale" };

const MENU = [
  { label: "Edit Profile", icon: Edit2, to: "/profile/edit" },
  { label: "Change Password", icon: Lock, to: "/profile/change-password" },
  { label: "Change Transaction PIN", icon: ShieldCheck, to: "/profile/change-pin" },
  { label: "Device Management", icon: Smartphone, to: "/profile/devices" },
  { label: "Help & Support", icon: LifeBuoy, to: "/support" },
  { label: "Settings", icon: SettingsIcon, to: "/settings" },
];

export default function Profile() {
  const { logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [kycTier, setKycTier] = useState(null);
  const [claimingBonus, setClaimingBonus] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [profileResult, kycResult] = await Promise.allSettled([getProfile(), getKycOverview()]);
      if (profileResult.status === "rejected") throw profileResult.reason;
      setProfile(profileResult.value.data);
      setKycTier(kycResult.status === "fulfilled" ? kycResult.value.data.verification?.currentTier : null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleClaimBonus = async () => {
    setClaimingBonus(true);
    try {
      await claimWelcomeBonus();
      toast("Welcome bonus added to your promotional balance.", "success");
      await load();
    } catch (error) {
      toast(error.response?.data?.message || "Could not claim the welcome bonus.", "error");
    } finally {
      setClaimingBonus(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      toast(error.response?.data?.message || "Could not securely sign out. Please try again.", "error");
    }
  };

  if (loading) return <SkeletonCard />;
  if (error) return <ErrorState message="Could not load your profile." onRetry={load} />;

  return (
    <div className="mx-auto max-w-lg space-y-5 animate-fade-in">
      <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Profile</h1>

      <Card className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-100 text-2xl font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
          {profile.fullName?.[0]?.toUpperCase() || <User size={24} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-text-primary dark:text-gray-100">{profile.fullName}</p>
          <p className="truncate text-sm text-text-secondary dark:text-gray-400">@{profile.username}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={profile.tier === "normal" ? "neutral" : "primary"}>
              Tier: {TIER_LABEL[profile.tier] || profile.tier || "Normal"}
            </Badge>
            <Badge variant={profile.isUpgraded ? "primary" : "neutral"}>
              {profile.isUpgraded && <Crown size={11} className="mr-1 inline" />}
              {profile.isUpgraded ? "Upgraded User" : "Normal User"}
            </Badge>
          </div>
        </div>
      </Card>

      {profile.welcomeBonusEligible && (
        <Card className="flex items-center gap-3">
          <Gift size={20} className="shrink-0 text-primary-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text-primary dark:text-gray-100">
              {new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(profile.welcomeBonusAmount)} welcome bonus
            </p>
            <p className="text-sm text-text-secondary dark:text-gray-400">Promotional balance for supported services.</p>
          </div>
          <button
            type="button"
            disabled={claimingBonus}
            onClick={handleClaimBonus}
            className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {claimingBonus ? "Claiming..." : "Claim"}
          </button>
        </Card>
      )}

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-text-secondary dark:text-gray-400">Account Information</h3>
        <div className="space-y-2.5 text-sm">
          <Row label="Account Number" value={profile.accountNumber} />
          <Row label="Tier" value={TIER_LABEL[profile.tier] || profile.tier || "Normal"} />
          <Row label="KYC Tier" value={kycTier ? `Tier ${kycTier}` : "Not verified"} />
          <Row label="Upgrade Status" value={profile.isUpgraded ? "Upgraded User" : "Normal User"} />
          <Row label="Email" value={profile.email} />
          <Row label="Referral Code" value={profile.referralCode} mono />
          {profile.businessName && <Row label="Business Name" value={profile.businessName} />}
        </div>
      </Card>

      <Card padded={false}>
        <div className="divide-y divide-borderc dark:divide-gray-800">
          {MENU.map(({ label, icon: Icon, to }) => (
            <Link key={to} to={to} className="flex items-center gap-3 px-4 py-3.5">
              <Icon size={18} className="text-text-secondary dark:text-gray-400" />
              <span className="flex-1 text-sm font-medium text-text-primary dark:text-gray-100">{label}</span>
              <ChevronRight size={16} className="text-gray-300" />
            </Link>
          ))}
          <button onClick={handleLogout} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <LogOut size={18} className="text-error" />
            <span className="text-sm font-medium text-error">Log Out</span>
          </button>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-secondary dark:text-gray-400">{label}</span>
      <span className={`font-medium text-text-primary dark:text-gray-100 ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}
