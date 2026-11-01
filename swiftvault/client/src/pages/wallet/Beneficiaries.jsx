import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Trash2, Send } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { SkeletonList } from "../../components/ui/Skeleton.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getBeneficiaries, deleteBeneficiary } from "../../services/transferService.js";

export default function Beneficiaries() {
  const navigate = useNavigate();
  const toast = useToast();
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getBeneficiaries();
      setBeneficiaries(data.beneficiaries || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    const prev = beneficiaries;
    setBeneficiaries((list) => list.filter((b) => b._id !== id));
    try {
      await deleteBeneficiary(id);
      toast("Beneficiary removed", "success");
    } catch {
      setBeneficiaries(prev);
      toast("Failed to remove beneficiary", "error");
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/wallet" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Beneficiaries</h1>
      </div>

      {loading && <SkeletonList count={5} />}
      {error && <ErrorState message="Could not load beneficiaries." onRetry={load} />}

      {!loading && !error && beneficiaries.length === 0 && (
        <EmptyState
          icon={Users}
          title="No beneficiaries yet"
          description="People you send money to will be saved here for quick transfers."
        />
      )}

      {!loading && !error && beneficiaries.length > 0 && (
        <Card padded={false}>
          <div className="divide-y divide-borderc dark:divide-gray-800">
            {beneficiaries.map((b) => (
              <div key={b._id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                  {b.name?.[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary dark:text-gray-100">{b.name}</p>
                  <p className="text-xs text-text-secondary dark:text-gray-400">{b.phone}</p>
                </div>
                <button
                  onClick={() => navigate("/transfer", { state: { phone: b.phone } })}
                  aria-label={`Send money to ${b.name}`}
                  className="rounded-lg p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30"
                >
                  <Send size={16} />
                </button>
                <button
                  onClick={() => handleDelete(b._id)}
                  aria-label={`Remove ${b.name}`}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-error dark:hover:bg-gray-800"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
