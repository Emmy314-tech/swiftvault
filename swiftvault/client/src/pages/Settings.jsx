import { Link } from "react-router-dom";
import { ArrowLeft, Moon, Sun, Globe, ShieldCheck, Bell, Sliders } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Toggle from "../components/ui/Toggle.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { usePreferences } from "../context/PreferencesContext.jsx";

const LANGUAGES = [
  { code: "en", label: "English", available: true },
  { code: "ha", label: "Hausa", available: false },
  { code: "yo", label: "Yoruba", available: false },
  { code: "ig", label: "Igbo", available: false },
  { code: "pcm", label: "Pidgin", available: false },
];

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { preferences, updatePreference } = usePreferences();

  return (
    <div className="mx-auto max-w-lg space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/profile" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Settings</h1>
      </div>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          {theme === "dark" ? <Moon size={17} className="text-primary-600" /> : <Sun size={17} className="text-primary-600" />}
          <h3 className="font-semibold text-text-primary dark:text-gray-100">Appearance</h3>
        </div>
        <Toggle
          checked={theme === "dark"}
          onChange={toggleTheme}
          label="Dark Mode"
          description="Switch between light and dark theme"
        />
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Globe size={17} className="text-primary-600" />
          <h3 className="font-semibold text-text-primary dark:text-gray-100">Language</h3>
        </div>
        <div className="space-y-1">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              disabled={!lang.available}
              onClick={() => updatePreference("language", lang.code)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${
                lang.available ? "hover:bg-gray-50 dark:hover:bg-gray-800" : "opacity-40"
              } ${preferences.language === lang.code ? "bg-primary-50 dark:bg-primary-900/20" : ""}`}
            >
              <span className="text-text-primary dark:text-gray-100">{lang.label}</span>
              {!lang.available && <span className="text-xs text-text-secondary">Coming soon</span>}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Bell size={17} className="text-primary-600" />
          <h3 className="font-semibold text-text-primary dark:text-gray-100">Notification Preferences</h3>
        </div>
        <div className="divide-y divide-borderc dark:divide-gray-800">
          <Toggle
            checked={preferences.notifyPurchases}
            onChange={(v) => updatePreference("notifyPurchases", v)}
            label="Purchase alerts"
            description="Airtime, data, and bill payment notifications"
          />
          <Toggle
            checked={preferences.notifySecurity}
            onChange={(v) => updatePreference("notifySecurity", v)}
            label="Security alerts"
            description="Login and PIN change notifications"
          />
          <Toggle
            checked={preferences.notifyPromotions}
            onChange={(v) => updatePreference("notifyPromotions", v)}
            label="Promotions"
            description="Offers and referral updates"
          />
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck size={17} className="text-primary-600" />
          <h3 className="font-semibold text-text-primary dark:text-gray-100">Privacy</h3>
        </div>
        <Toggle
          checked={preferences.showProfileToOthers}
          onChange={(v) => updatePreference("showProfileToOthers", v)}
          label="Show my name to recipients"
          description="Let people you send money to see your full name"
        />
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Sliders size={17} className="text-primary-600" />
          <h3 className="font-semibold text-text-primary dark:text-gray-100">App Preferences</h3>
        </div>
        <Toggle
          checked={preferences.hideBalanceByDefault}
          onChange={(v) => updatePreference("hideBalanceByDefault", v)}
          label="Hide balance by default"
          description="Wallet balance will be masked when you open the app"
        />
      </Card>

      <p className="text-center text-xs text-text-secondary dark:text-gray-500">
        Notification, privacy, and app preferences above are saved on this device only.
      </p>
    </div>
  );
}
