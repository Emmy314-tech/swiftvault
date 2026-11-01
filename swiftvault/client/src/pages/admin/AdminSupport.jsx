import { useCallback, useEffect, useState } from "react";
import { LifeBuoy } from "lucide-react";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Card from "../../components/ui/Card.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { SkeletonList } from "../../components/ui/Skeleton.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getAdminSupportTickets, updateAdminSupportTicket } from "../../services/supportService.js";

const STATUSES = [
  ["open", "Open"],
  ["in_review", "In review"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
];

const STATUS_VARIANT = {
  open: "warning",
  in_review: "primary",
  resolved: "success",
  closed: "neutral",
};

const formatDate = (date) => new Date(date).toLocaleString();

export default function AdminSupport() {
  const toast = useToast();
  const [tickets, setTickets] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [drafts, setDrafts] = useState({});
  const [statusDrafts, setStatusDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [error, setError] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getAdminSupportTickets({
        status: statusFilter || undefined,
      });
      setTickets(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const saveUpdate = async (ticket) => {
    const message = drafts[ticket._id] || "";
    const status = statusDrafts[ticket._id] || ticket.status;
    setUpdating(ticket._id);
    try {
      await updateAdminSupportTicket(ticket._id, {
        status,
        ...(message.trim() ? { message } : {}),
      });
      setDrafts((current) => ({ ...current, [ticket._id]: "" }));
      toast("Support request updated.", "success");
      await loadTickets();
    } catch (requestError) {
      toast(requestError.response?.data?.message || "Could not update this support request.", "error");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Support requests</h1>
          <p className="mt-1 text-sm text-text-secondary dark:text-gray-400">Review customer questions and complaints.</p>
        </div>
        <select
          aria-label="Filter support requests by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border border-borderc bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          <option value="">All statuses</option>
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {loading && <SkeletonList count={5} />}
      {error && <ErrorState message="Could not load support requests." onRetry={loadTickets} />}
      {!loading && !error && tickets.length === 0 && (
        <Card><EmptyState icon={LifeBuoy} title="No requests found" description="New customer requests will appear here." /></Card>
      )}
      {!loading && !error && tickets.map((ticket) => (
        <Card key={ticket._id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-text-primary dark:text-gray-100">{ticket.subject}</p>
              <p className="mt-1 text-xs text-text-secondary dark:text-gray-400">
                {ticket.userId?.fullName || "Customer"} · @{ticket.userId?.username || "unknown"} · {ticket.category}
              </p>
              <p className="mt-1 text-xs text-text-secondary dark:text-gray-400">
                Opened {formatDate(ticket.createdAt)}{ticket.reference ? ` · Ref: ${ticket.reference}` : ""}
              </p>
            </div>
            <Badge variant={STATUS_VARIANT[ticket.status] || "neutral"}>{ticket.status.replace("_", " ")}</Badge>
          </div>

          <div className="mt-4 space-y-3 border-t border-borderc pt-4 dark:border-gray-800">
            {ticket.messages.map((entry) => (
              <div key={entry._id} className={`rounded-xl p-3 ${entry.authorType === "admin" ? "bg-primary-50 dark:bg-primary-900/20" : "bg-gray-50 dark:bg-gray-800/70"}`}>
                <div className="mb-1 flex justify-between gap-3 text-xs">
                  <span className="font-semibold">{entry.authorType === "admin" ? "Support team" : "Customer"}</span>
                  <time dateTime={entry.createdAt} className="text-gray-500">{formatDate(entry.createdAt)}</time>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-700 dark:text-gray-300">{entry.body}</p>
              </div>
            ))}
          </div>
          {ticket.statusHistory?.length > 0 && (
            <p className="mt-3 text-xs leading-5 text-text-secondary dark:text-gray-400">
              Status history: {ticket.statusHistory.map((event) =>
                `${event.status.replace("_", " ")} by ${event.actorType} · ${formatDate(event.createdAt)}`
              ).join(" → ")}
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Status
              <select
                value={statusDrafts[ticket._id] || ticket.status}
                onChange={(event) => setStatusDrafts((current) => ({ ...current, [ticket._id]: event.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="flex items-end">
              <Button size="sm" fullWidth={false} loading={updating === ticket._id} onClick={() => saveUpdate(ticket)}>
                Save update
              </Button>
            </div>
          </div>
          <label className="mt-3 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Reply to customer (optional)
            <textarea
              minLength={5}
              maxLength={4000}
              value={drafts[ticket._id] || ""}
              onChange={(event) => setDrafts((current) => ({ ...current, [ticket._id]: event.target.value }))}
              rows={3}
              placeholder="Write a clear response; avoid requesting passwords, PINs, OTPs, or card credentials."
              className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white p-3 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
        </Card>
      ))}
    </div>
  );
}
