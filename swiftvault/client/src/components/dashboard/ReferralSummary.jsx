import { Gift, Copy, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import Card from "../ui/Card.jsx";
import { useToast } from "../../context/ToastContext.jsx";

export default function ReferralSummary({ code }) {
  const toast = useToast();

  const link = code ? `${window.location.origin}/register?ref=${code}` : "";

  const copy = () => {
    navigator.clipboard.writeText(link);
    toast("Referral link copied", "success");
  };

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
          <Gift size={17} />
        </div>
        <h3 className="flex-1 font-semibold text-text-primary dark:text-gray-100">Referral Program</h3>
        <Link to="/referrals" aria-label="View referral details" className="text-primary-600">
          <ChevronRight size={18} />
        </Link>
      </div>

      {code ? (
        <>
          <p className="text-xs text-text-secondary dark:text-gray-400">Your referral code</p>
          <div className="mt-1 flex items-center justify-between rounded-xl border border-borderc px-3 py-2.5 dark:border-gray-700">
            <span className="font-mono text-sm font-semibold text-text-primary dark:text-gray-100">{code}</span>
            <button onClick={copy} aria-label="Copy referral link" className="text-primary-600">
              <Copy size={16} />
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-text-secondary dark:text-gray-400">Your referral code will appear here.</p>
      )}
    </Card>
  );
}
