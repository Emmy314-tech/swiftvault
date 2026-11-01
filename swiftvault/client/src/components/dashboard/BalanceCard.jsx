import { Eye, EyeOff, Copy, Landmark } from "lucide-react";
import { useState } from "react";
import { useToast } from "../../context/ToastContext.jsx";
import { usePreferences } from "../../context/PreferencesContext.jsx";

export default function BalanceCard({ walletBalance, bonusBalance, paystackAccount, username }) {
  const { preferences } = usePreferences();
  const [hidden, setHidden] = useState(preferences.hideBalanceByDefault);
  const toast = useToast();

  const format = (n) => `₦${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  const copyAccount = () => {
    if (!paystackAccount?.account?.accountNumber) return;
    navigator.clipboard.writeText(paystackAccount.account.accountNumber);
    toast("Account number copied", "success");
  };

  return (
    <div className="relative overflow-hidden rounded-2xl gradient-primary p-6 text-white shadow-lg">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
      <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/5" />

      <div className="relative flex items-center justify-between">
        <p className="text-sm font-medium text-white/80">Wallet Balance</p>
        <button onClick={() => setHidden((v) => !v)} aria-label={hidden ? "Show balance" : "Hide balance"}>
          {hidden ? <EyeOff size={18} className="text-white/80" /> : <Eye size={18} className="text-white/80" />}
        </button>
      </div>

      <p className="relative mt-1 text-3xl font-bold tracking-tight">
        {hidden ? "₦ • • • • • •" : format(walletBalance)}
      </p>

      {bonusBalance > 0 && (
        <p className="relative mt-1 text-sm text-white/80">
          + {hidden ? "••••" : format(bonusBalance)} bonus balance
        </p>
      )}

      {paystackAccount?.accountStatus === "active" && paystackAccount.account?.accountNumber && (
        <div className="relative mt-5 flex items-center justify-between rounded-xl glass px-4 py-3">
          <div className="flex items-center gap-2 text-white">
            <Landmark size={16} className="text-white/80" />
            <div>
              <p className="text-xs text-white/70">{paystackAccount.account.bankName}</p>
              <p className="text-sm font-semibold tracking-wide">{paystackAccount.account.accountNumber}</p>
              <p className="mt-1 text-xs text-white/90">
                Account name: {paystackAccount.account.accountName || "Provider name unavailable"}
              </p>
              {username && <p className="text-xs text-white/70">SwiftVault username: @{username}</p>}
            </div>
          </div>
          <button
            onClick={copyAccount}
            aria-label="Copy account number"
            className="rounded-lg bg-white/15 p-2 hover:bg-white/25"
          >
            <Copy size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
